import {
  categorise,
  decide,
  saveInstead,
  templateWording,
  toSummary,
  withAlternative,
  type Alternative,
  type Decision,
  type PurchaseRequest,
  type UserChoice,
  type Wording,
} from '@resist/engine';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAlternative } from '../lib/api';
import { appendLog, getToday, loadState, onStateChange, saveState, type State } from '../lib/storage';
import { speak, stopSpeaking } from '../lib/voice';
import { Avatar } from './components/Avatar';
import { Badge } from './components/Badge';
import { CheckIn } from './components/CheckIn';
import { Dashboard } from './components/Dashboard';
import { Toast } from './components/Toast';
import { installInterceptor, type Product } from './detect';

export interface ActiveCheckIn {
  id: number;
  req: PurchaseRequest;
  decision: Decision;
  wording: Wording;
  proceed: () => void;
}

/** Green purchases: show the badge briefly, then let the click through. */
const GREEN_PASS_MS = 900;

export function App() {
  const [state, setState] = useState<State | null>(null);
  const stateRef = useRef<State | null>(null);
  const [checkIn, setCheckIn] = useState<ActiveCheckIn | null>(null);
  const [alternative, setAlternative] = useState<Alternative | null>(null);
  const [altLoading, setAltLoading] = useState(false);
  const [badge, setBadge] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    loadState().then((s) => {
      stateRef.current = s;
      setState(s);
    });
    return onStateChange((s) => {
      stateRef.current = s;
      setState(s);
    });
  }, []);

  const onBuy = useCallback((p: Product, proceed: () => void) => {
    const s = stateRef.current;
    if (!s) return proceed(); // not loaded yet: never get in the way
    const today = getToday(s.settings);
    const req: PurchaseRequest = { ...p, category: categorise(p.item) };
    const decision = decide(s.profile, req, { today, log: s.log });
    const wording = templateWording(toSummary(s.profile, req, decision, today));

    if (decision.outcome === 'green') {
      void appendLog(logEntry(req, decision, 'continued', today));
      setBadge(true);
      setTimeout(() => setBadge(false), 2500);
      setTimeout(proceed, GREEN_PASS_MS);
      return;
    }

    const id = ++seq.current;
    setCheckIn({ id, req, decision, wording, proceed });
    setAlternative(null);
    setAltLoading(true);
    if (s.settings.voice && wording.spoken) speak(wording.spoken);

    // In parallel, never delaying the pop-up: cheaper same-model option. Only title + price leave the device.
    fetchAlternative({ item: req.item, price: req.price })
      .then((raw) => {
        if (seq.current !== id) return;
        const cur = stateRef.current ?? s;
        setAlternative(raw ? withAlternative(cur.profile, req, today, raw) : null);
      })
      .finally(() => seq.current === id && setAltLoading(false));
  }, []);

  useEffect(() => installInterceptor(onBuy), [onBuy]);

  const choose = useCallback(
    async (choice: UserChoice, answers?: Record<string, string>) => {
      const c = checkIn;
      const s = stateRef.current;
      if (!c || !s) return;
      const today = getToday(s.settings);
      const total = c.req.price * c.req.qty;
      stopSpeaking();
      seq.current++; // ignore late alternative results
      setCheckIn(null);
      await appendLog(logEntry(c.req, c.decision, choice, today, answers));

      if (choice === 'continued') c.proceed();
      if (choice === 'cheaper' && alternative) window.open(alternative.url, '_blank', 'noopener');
      if (choice === 'saved') {
        const fresh = await loadState();
        const profile = saveInstead(fresh.profile, total);
        await saveState({ profile });
        setToast(`Saved instead. ${profile.goal.label}: £${profile.goal.saved.toFixed(2)} of £${profile.goal.amount}.`);
      }
      if (choice === 'remind') {
        const fresh = await loadState();
        const due = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        await saveState({ reminders: [...fresh.reminders, { item: c.req.item, price: total, url: location.href, due }] });
        setToast("OK. I'll remind you about it tomorrow.");
      }
    },
    [checkIn, alternative],
  );

  if (!state) return null;
  const today = getToday(state.settings);

  return (
    <>
      {checkIn && (
        <CheckIn
          key={checkIn.id}
          checkIn={checkIn}
          setOn={state.profile.setOn}
          alternative={alternative}
          altLoading={altLoading}
          onChoice={choose}
        />
      )}
      {badge && <Badge />}
      {toast && <Toast text={toast} onDone={() => setToast(null)} />}
      {dashboardOpen && <Dashboard state={state} today={today} onClose={() => setDashboardOpen(false)} />}
      {!dashboardOpen && !checkIn && <Avatar onOpen={() => setDashboardOpen(true)} />}
    </>
  );
}

function logEntry(
  req: PurchaseRequest,
  d: Decision,
  choice: UserChoice,
  today: string,
  answers?: Record<string, string>,
) {
  return {
    item: req.item,
    price: req.price,
    qty: req.qty,
    category: req.category,
    site: req.site,
    outcome: d.outcome,
    choice,
    ruleId: d.ruleBroken?.id ?? null,
    ...(answers && Object.keys(answers).length ? { answers } : {}),
    date: today,
    at: new Date().toISOString(),
  };
}
