import { forecast, gbp, prettyDate, recap, type ISODate } from '@resist/engine';
import { useEffect, useRef, useState } from 'react';
import { resetDemo, type State } from '../../lib/storage';
import { ForecastChart } from './ForecastChart';
import { GoalTrend } from './GoalTrend';
import { Recap } from './Recap';

interface Props {
  state: State;
  today: ISODate;
  onClose: () => void;
}

/** Three-quarter-screen overlay over a dimmed page. */
export function Dashboard({ state, today, onClose }: Props) {
  const { profile, log } = state;
  const [tab, setTab] = useState<'plan' | 'recap'>('plan');
  const panel = useRef<HTMLDivElement>(null);
  const f = forecast(profile, today);
  const month = recap(profile, log, today);
  const goalPct = Math.min(100, Math.round((profile.goal.saved / profile.goal.amount) * 100));

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="rob-dim" onClick={onClose}>
      <div
        className="rob-dash"
        role="dialog"
        aria-modal="true"
        aria-label="Your plan"
        tabIndex={-1}
        ref={panel}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="rob-dash-head">
          <div>
            <h2>Here's what you told me on {prettyDate(profile.setOn)}</h2>
            <p className="rob-muted">I'll remind you. You decide.</p>
          </div>
          <nav className="rob-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'plan'} onClick={() => setTab('plan')}>Plan</button>
            <button role="tab" aria-selected={tab === 'recap'} onClick={() => setTab('recap')}>Recap</button>
          </nav>
          <button className="rob-x" aria-label="Close" onClick={onClose}>×</button>
        </header>

        {tab === 'plan' ? (
          <div className="rob-dash-grid">
            <p className="rob-stats rob-span2" aria-label="This month">
              <span>Promises kept <b>{month.kept}</b></span>
              <span aria-hidden="true">·</span>
              <span>Overruled <b>{month.overruled}</b></span>
              <span aria-hidden="true">·</span>
              <span><b>{gbp(month.redirected)}</b> redirected to {profile.goal.label}</span>
            </p>
            <section className="rob-card rob-span2">
              <h3>
                Balance to {f.nextIncome ? `${f.nextIncome.label}, ${prettyDate(f.nextIncome.date)}` : 'the next 30 days'}
              </h3>
              <p className="rob-muted">
                Lowest point <b>{gbp(f.lowest.amount)}</b> on {prettyDate(f.lowest.date)} · today {gbp(profile.balance)}
              </p>
              <ForecastChart points={f.points} lowest={f.lowest} />
            </section>

            <section className="rob-card">
              <h3>{profile.goal.label}</h3>
              <p className="rob-muted">
                {gbp(profile.goal.saved)} of {gbp(profile.goal.amount)} by {prettyDate(profile.goal.by)}
              </p>
              <div className="rob-bar" role="progressbar" aria-valuenow={goalPct} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${goalPct}%` }} />
              </div>
              <GoalTrend profile={profile} log={log} today={today} />
            </section>

            <section className="rob-card">
              <h3>Your rules</h3>
              <ul className="rob-rules">
                {profile.rules.map((r) => (
                  <li key={r.id}>“{r.said}”</li>
                ))}
              </ul>
            </section>

            <section className="rob-card rob-span2">
              <h3>Recent check-ins</h3>
              {log.length === 0 ? (
                <p className="rob-muted">Nothing yet. I stay quiet when you're on track.</p>
              ) : (
                <ul className="rob-log">
                  {log.slice(-5).reverse().map((e) => (
                    <li key={e.at + e.item}>
                      <span className={`rob-pill rob-${e.outcome}`}>{e.outcome}</span>
                      <span className="rob-log-item">{e.item}</span>
                      <span>{gbp(e.price * e.qty)}</span>
                      <span className="rob-muted">{e.choice}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : (
          <Recap state={state} today={today} />
        )}

        <footer className="rob-dash-foot">
          <span className="rob-muted">Your bank data stays on this device.</span>
          <button className="rob-link" onClick={() => void resetDemo()}>Reset demo</button>
        </footer>
      </div>
    </div>
  );
}
