// Content script: window CustomEvents <-> @keephard/voice. Backend calls proxied via background.js.
import { createInterrogation, type Interrogation } from '../../src/index';
import demoProfile from '../../../shared/demo-profile.json';
import { detectProduct, isProductUrl } from './detect';

/** All side effects live in initBridge so the module can be imported at build time (WXT) without touching window/chrome.
 *  integrated=true: no own panel; a headless EventUi emits `keephard:ui` events for the host UI (Pocket/Bloub). */
export function initBridge(opts: { integrated?: boolean; dashboardBeat?: boolean } = {}): void {
const integrated = !!opts.integrated;

const BACKEND = 'http://localhost:8787';

// Cross-world note: a CustomEvent dispatched from the page's main world arrives here with detail === null
// when detail is an object (Chrome isolated-world rule). Strings survive. So:
//  - incoming keephard:* accept detail as an object OR a JSON string (null is ignored);
//  - outgoing: every event is dispatched as `keephard:<name>` (object detail, for the isolated-world frontend)
//    AND as `keephard-json:<name>` (detail = JSON string, readable from main-world / console listeners).
const emit = (name: string, detail?: unknown) => {
  window.dispatchEvent(new CustomEvent('keephard:' + name, { detail }));
  let json = '';
  try { json = JSON.stringify(detail ?? {}); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('keephard-json:' + name, { detail: json }));
};

function readDetail(e: Event): any | undefined {
  const d = (e as CustomEvent).detail;
  if (d == null) return undefined;
  if (typeof d === 'string') {
    try { const o = JSON.parse(d); return o && typeof o === 'object' ? o : undefined; } catch { return undefined; }
  }
  return typeof d === 'object' ? d : undefined;
}

function bytes(b64: string): Uint8Array {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

// Pre-warmed signed session (same body as the Session will POST), consumed once.
let warm: { body: string; at: number; p: Promise<any> } | undefined;
function prewarmSession(product: any) {
  try {
    const body = JSON.stringify({ profile: demoProfile, product });
    if (warm && warm.body === body) return;
    const p = chrome.runtime.sendMessage({ type: 'keephard:fetch', url: BACKEND + '/api/voice/session', method: 'POST', headers: { 'content-type': 'application/json' }, body });
    p.catch(() => {});
    warm = { body, at: Date.now(), p };
  } catch { /* ignore */ }
}
let micGranted = false;
function prewarmEnv() {
  try { (navigator.permissions as any).query({ name: 'microphone' }).then((r: any) => { micGranted = r.state === 'granted'; r.onchange = () => { micGranted = r.state === 'granted'; }; }).catch(() => {}); } catch { /* ignore */ }
  try { chrome.runtime.sendMessage({ type: 'keephard:fetch', url: BACKEND + '/health', method: 'GET' }).catch(() => {}); } catch { /* ignore */ }
}

const proxyFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  let res: any;
  if (url.endsWith('/api/voice/session') && warm && typeof init?.body === 'string' && init.body === warm.body && Date.now() - warm.at < 90000) {
    const w = warm; warm = undefined;
    try { const r = await w.p; if (r && !r.error && r.status >= 200 && r.status < 300) res = r; } catch { /* fall through */ }
  }
  if (!res) res = await chrome.runtime.sendMessage({
    type: 'keephard:fetch',
    url,
    method: init?.method,
    headers: init?.headers,
    body: typeof init?.body === 'string' ? init.body : undefined,
  });
  if (!res || res.error) throw new Error(res?.error || 'no response from background');
  return new Response(bytes(res.body) as BlobPart, { status: res.status, headers: { 'content-type': res.contentType } });
};

let session: Interrogation | undefined;
let ui: Panel | undefined;
let lastDemo = false;
let autoChain = true;
let lastProduct: any;
let chainBusy = false;

// ---------- search + savings ----------
const SAVINGS_KEY = 'keephard.savings';

let userLines: string[] = [];   // what the user said this session
let reasonSummary = '';          // verdict.userReasonSummary
const currentReason = (): string | undefined => {
  const t = [userLines.join(' '), reasonSummary].map((x) => x.trim()).filter(Boolean).join(' | ').slice(0, 600);
  return t || undefined;
};

async function runSearch(product: any, demo?: boolean): Promise<any> {
  const call = () => proxyFetch(BACKEND + '/api/search' + (demo ? '?demo=1' : ''), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product, reasonText: currentReason() }),
  });
  // one retry after ~1.2s on a network failure or 5xx (backend restarting); the backend reuses its prefetch for the same product
  let res: Response | undefined;
  try { res = await call(); } catch { /* network: retry */ }
  if (!res || res.status >= 500) { await new Promise((r) => setTimeout(r, 1200)); res = await call(); }
  if (!res.ok) throw new Error('search HTTP ' + res.status);
  return res.json();
}

async function readSavings(): Promise<{ entries: any[]; savedByKeepHard: number }> {
  try {
    const o = await chrome.storage.local.get(SAVINGS_KEY);
    const v = o?.[SAVINGS_KEY];
    return { entries: Array.isArray(v?.entries) ? v.entries : [], savedByKeepHard: Number(v?.savedByKeepHard) || 0 };
  } catch { return { entries: [], savedByKeepHard: 0 }; }
}

async function recordSavings(amount: number, label: string) {
  const cur = await readSavings();
  const entry = { at: new Date().toISOString(), label, amount };
  const next = { entries: [...cur.entries, entry], savedByKeepHard: Math.round((cur.savedByKeepHard + amount) * 100) / 100 };
  try { await chrome.storage.local.set({ [SAVINGS_KEY]: next }); } catch (e) { console.warn('[keephard] savings persist failed', e); }
  return { entry, total: next.savedByKeepHard };
}

async function sayLine(text: string, state: string, prio: any = 'beat') {
  if (session) return session.say(text, state as any, prio);
  const s = createInterrogation({ profile: demoProfile as any, product: {} as any, backendUrl: BACKEND, demo: lastDemo, fetch: proxyFetch });
  s.on('state', (st) => emit('state', { state: st }));
  s.on('error', (err) => { console.warn('[keephard]', err); ui?.error(String((err as any)?.message || err)); });
  return s.say(text, state as any, prio);
}

// Search only (no speech, no persistence). Emits keephard:searchresult {result} or {error}.
const SEARCH_TIMEOUT_MS = 9000;
const NOT_FOUND_LINES = ['Looked everywhere. Not a penny cheaper, I am afraid.', 'Checked the lot. Nowt cheaper. Sorry, pal.', 'Had a proper look. That is as low as it goes.', 'Annoying, but this is the best price going.'];
let nfIdx = Math.floor(Math.random() * NOT_FOUND_LINES.length);
let closeT: any;

/** fully close everything: timers, mic/session, bubble, card, toast */
function closeAll(why: string) {
  clearTimeout(closeT); clearTimers(); stop(); offerGen++;
  ui?.dismiss(); emit('state', { state: 'idle' }); emit('idle', { why });
}

/** not found / search failed: one dry line, neutral avatar, then auto-close */
async function endNotFound(why: string, final = true) {
  offerGen++;
  const line = NOT_FOUND_LINES[nfIdx++ % NOT_FOUND_LINES.length]!;
  clearTimeout(closeT);
  closeT = setTimeout(() => closeAll('notfound hard cap'), integrated ? 40000 : 14000);
  if (!final) { emit('caption', { text: line, who: 'avatar' }); ui?.caption(line, 'avatar'); return; } // round 1 reject: stay open, the user may insist
  try { if (!integrated) stop(); ui?.hideOffer(); ui?.peek(true); ui?.state('idle'); emit('state', { state: 'idle' }); emit('caption', { text: line, who: 'avatar' }); ui?.caption(line, 'avatar'); ui?.scheduleHide(60000); } catch { /* ignore */ }
  try { ui?.state('idle'); } catch { /* ignore */ }
  if (integrated) { await armGrace(); } // mic stays open ~8s; a spoken reply gets one closing line
  clearTimeout(closeT);
  ui?.fadeOut(4000);
  closeT = setTimeout(() => closeAll(why), 4400);
}

async function doSearch(product: any, demo?: boolean) {
  try {
    const result = await Promise.race([
      runSearch(product, demo),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('search timed out')), SEARCH_TIMEOUT_MS)),
    ]);
    emit('searchresult', { result });
    ui?.result(result);
    return result;
  } catch (e) {
    emit('searchresult', { error: String((e as any)?.message || e) });
    console.warn('[keephard] search failed', e);
    return undefined;
  }
}

const NUDGES = ['Go on.', 'Still there?', 'Right then. I am waiting.', 'Not like you, that. Go on.', 'Take your time. Not too much of it, mind.'];
let autoRedirect = true;
function mascotPresent(): boolean {
  try { return !!document.querySelector('[data-keephard-mascot],[id*="bloub" i],[class*="bloub" i]'); } catch { return false; }
}
const K_DONE = 'keephard.done.';
const prodKey = (p: any): string => { const m = String(p?.url || location.href).match(/\/(?:dp|gp\/product)\/([A-Z0-9]{8,12})/i); return (m ? m[1]!.toUpperCase() : String(p?.url || location.href)).slice(0, 200); };
const started = new Set<string>();
function wasDone(k: string): boolean { if (started.has(k)) return true; try { return !!sessionStorage.getItem(K_DONE + k); } catch { return false; } }
function markDone(k: string) { started.add(k); try { sessionStorage.setItem(K_DONE + k, '1'); } catch { /* ignore */ } }
function clearDone() { started.clear(); try { Object.keys(sessionStorage).filter((x) => x.startsWith(K_DONE)).forEach((x) => sessionStorage.removeItem(x)); } catch { /* ignore */ } }
let idleT: any, capT: any;
function clearTimers() { clearTimeout(idleT); clearTimeout(capT); clearTimeout(graceT); }
/** quiet shutdown: close session + mic, hide bubble, no spoken line */
function quietEnd(why: string) {
  clearTimers(); stop(); offerGen++;
  ui?.peek(false); ui?.state('idle'); emit('state', { state: 'idle' }); emit('idle', { why });
}
let offerGen = 0; // bumped on cancel/new offer so stale countdowns do nothing

function safeHttp(u: any): string | undefined {
  try { const x = new URL(String(u)); return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : undefined; } catch { return undefined; }
}

// Offer beat: (wait for the agent) -> search -> say spokenLine -> countdown -> same-tab redirect.
// Saving is recorded only at the moment of redirect (countdown end or "Buy it cheaper"), never on offer / cancel.
async function offerBeat(product: any, demo: boolean | undefined, s?: Interrogation, verdict?: string, final = true) {
  if (chainBusy) return;
  chainBusy = true;
  let shown = false;
  let beatOn = opts.dashboardBeat === true;
  try { const o = await chrome.storage.local.get('keephard.dashboardBeat'); if (typeof o?.['keephard.dashboardBeat'] === 'boolean') beatOn = o['keephard.dashboardBeat']; } catch { /* default */ }
  const impact = integrated && beatOn && verdictSeen && (verdict === 'reject' || verdict === 'accept');
  const tone = verdict === 'accept' ? 'caution' : 'reject';
  const wd = setTimeout(() => { if (!shown) closeAll('verdict watchdog'); }, impact ? 45000 : 20000);
  try {
    const searchP = doSearch(product, demo); // starts now (cold live search can take 3-7s); overlaps the verdict line + dashboard beat
    if (s) { try { await Promise.race([s.agentDone(), new Promise((r) => setTimeout(r, 9000))]); if (!integrated) s.endVoice(); } catch { /* ignore */ } } // the queue also waits for the live agent
    const gen = ++offerGen;
    // Strictly serial speech: every clip goes through the voice layer's single priority queue (never two voices at once).
    // The live agent is the ONLY voice: dashboard / savings / not-found lines are TEXT in the transcript, never audio.
    const speak = async (text: string, _state?: string, _prio?: string, _capMs?: number) => {
      emit('caption', { text, who: 'avatar' }); ui?.caption(text, 'avatar');
    };
    if (impact) { // dashboard goal-impact beat plays while the search may still be pending
      const ipx = Number(product?.price) > 0 ? Number(product.price) : DEMO_PRODUCT.price; // never an empty panel
      ui?.impact(ipx, tone); emit('impact', { price: ipx, tone });
      emit('state', { state: tone === 'caution' ? 'happy' : 'disappointed' });
      await speak(tone === 'caution' ? CAUTION_LINE : IMPACT_LINE, tone === 'caution' ? 'happy' : 'disappointed', 'beat', 25000);
      if (gen !== offerGen) return;
    }
    const result = await searchP; // waits for the rest of the ~9s search budget
    if (gen !== offerGen) return;
    if (!result || !result.found || !result.alternative) { shown = true; clearTimeout(wd); await endNotFound(result ? 'not found' : 'search failed', final); return; }
    shown = true; clearTimeout(wd);
    const alt = result.alternative;
    const url = safeHttp(alt.url);
    let settled = false;
    const go = async () => {
      if (settled || gen !== offerGen) return;
      settled = true; offerGen++; stop();
      ui?.hideOffer();
      if (!url) { await endNotFound('bad url'); return; }
      const amount = Number(result.savings) || 0;
      if (amount > 0) {
        const { entry, total } = await recordSavings(amount, `${alt.title} @ ${alt.retailer}`);
        emit('savings', { amount: entry.amount, label: entry.label, at: entry.at, savedByKeepHard: total });
      }
      emit('redirect', { url });
      if (integrated) { (ui as any)?.recovered?.(Number(product?.price) || 0, amount); await new Promise((r) => setTimeout(r, 1600)); } // let the dashboard show the goal recovering
      window.location.assign(url);
    };
    const cancel = () => { if (settled) return; settled = true; offerGen++; if (!(integrated && closingHandled)) stop(); ui?.hideOffer(); emit('offerdismissed', {}); };
    if (impact) { // beat line already played: now the savings line, THEN the card + countdown
      if (result.spokenLine) { await speak(String(result.spokenLine), 'happy', 'savings', 25000); if (gen !== offerGen) return; }
      emit('state', { state: 'happy' });
      ui?.offer(result, (opened) => { if (opened) void go(); else cancel(); });
      emit('offer', { result, verdict });
    } else {
      ui?.offer(result, (opened) => { if (opened) void go(); else cancel(); });
      emit('offer', { result, verdict });
      if (result.spokenLine) await speak(String(result.spokenLine), 'happy', 'savings', 25000); else emit('state', { state: 'happy' });
    }
    if (!final) return; // first reject: card + dashboard shown, session and mic stay open for the user's reply
    if (autoRedirect && url && !settled && gen === offerGen) { ui?.countdown(3, () => void go(), cancel); if (integrated) void armGrace(); }
    else if (!settled) { if (integrated) void armGrace(); else stop(); } // card only: standalone closes the voice; integrated keeps a grace window
  } catch (e) { console.warn('[keephard] offer beat failed', e); if (!shown) { shown = true; clearTimeout(wd); await endNotFound('error'); } }
  finally { clearTimeout(wd); chainBusy = false; }
}

// Integrated mode: after the verdict the live session + mic stay open for a ~8s grace window after the last avatar
// speech. If the user says something, the live agent answers with ONE closing line; then the mic is closed fully.
const GRACE_MS = 8000;
let graceT: any, graceDone: (() => void) | undefined, closingHandled = false, verdictSeen = false;
function armGrace(): Promise<void> {
  if (!integrated || !session || closingHandled) return Promise.resolve();
  clearTimeout(graceT);
  return new Promise<void>((res) => {
    graceDone = res;
    graceT = setTimeout(() => { graceDone = undefined; stop(); res(); }, GRACE_MS);
  });
}
/** our own TTS (cached backend voice) with the live mic muted so it cannot hear itself */
async function sayMuted(text: string, state: string, prio: any = 'beat') {
  const s = session; const conv = (s as any)?.conv;
  try { conv?.setMicMuted?.(true); } catch { /* ignore */ }
  try { return await sayLine(text, state, prio); }
  finally { try { if (session === s) conv?.setMicMuted?.(false); } catch { /* ignore */ } }
}

function stop() {
  clearTimeout(graceT); const gd = graceDone; graceDone = undefined;
  session?.stop();
  session = undefined;
  gd?.();
}

function startSession(d: any, force = false): Promise<void> {
  const k = prodKey(d.product);
  if (!force && wasDone(k)) return Promise.resolve(); // once per product per tab session
  markDone(k);
  clearTimers();
  stop();
  lastDemo = !!d.demo;
  lastProduct = d.product;
  userLines = []; reasonSummary = ''; verdictSeen = false; closingHandled = false;
  autoChain = d.autoSavings !== false;
  const s = createInterrogation({
    profile: d.profile || (demoProfile as any),
    product: d.product,
    backendUrl: BACKEND,
    demo: d.demo,
    fetch: proxyFetch,
  });
  session = s;
  let userSpoke = false, gotQ = false, armed = false;
  const nm = String((d.profile || demoProfile as any)?.name || '');
  const pool = NUDGES.filter((l) => !l.includes('{n}') || nm === 'Sam').map((l) => l.replace('{n}', nm));
  const pickNudge = () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
  // silence ladder: nudge at ~6s, nudge ~6s later, close quietly ~8s after that. Mic muted while a nudge plays.
  const armIdle = (step = 0) => {
    clearTimeout(idleT);
    if (userSpoke) return;
    armed = true;
    idleT = setTimeout(async () => {
      if (session !== s || userSpoke) return;
      if (step >= 1) { quietEnd('no user speech'); return; } // at most ONE nudge per session
      const line = pickNudge();
      const conv = (s as any).conv;
      try { conv?.setMicMuted?.(true); } catch { /* ignore */ }
      if (line) { emit('caption', { text: line, who: 'avatar' }); ui?.caption(line, 'avatar'); try { await s.say(line, 'listening', 'nudge'); } catch { /* ignore */ } }
      try { conv?.setMicMuted?.(false); } catch { /* ignore */ }
      if (session === s && !userSpoke) armIdle(step + 1);
    }, step >= 2 ? 8000 : 6000);
  };
  capT = setTimeout(() => { if (session === s && !chainBusy) quietEnd('session cap'); }, 60000);
  s.on('state', (state) => { if (session !== s) return; emit('state', { state }); ui?.state(state); if (state === 'listening' && gotQ && !armed) armIdle(); });
  s.on('caption', (text, who) => {
    if (session !== s) return;
    if (who === 'user') { userLines.push(text); userSpoke = true; clearTimeout(idleT); } else if (!gotQ) { gotQ = true; }
    emit('caption', { text, who }); ui?.caption(text, who);
    if (who === 'user' && integrated && verdictSeen && !closingHandled && !chainBusy && s.finished) { // spoke after the verdict: pause auto-redirect, let the agent say ONE closing line
      closingHandled = true; clearTimeout(graceT);
      (ui as any)?.pauseCountdown?.();
      const done = graceDone; graceDone = undefined;
      void (async () => { await new Promise((r) => setTimeout(r, 1800)); try { await s.agentDone(12000); } catch { /* ignore */ } if (session === s) stop(); done?.(); })();
    }
  });
  s.on('verdict', (verdict) => {
    if (session !== s) return; verdictSeen = true; clearTimeout(idleT); clearTimeout(capT); if (verdict?.userReasonSummary) reasonSummary = String(verdict.userReasonSummary); emit('verdict', { verdict }); ui?.scheduleHide(60000); if (!integrated) ui?.caption(`Verdict: ${verdict.verdict} (${verdict.reasonCategory})`, 'avatar');
    if (autoChain) void offerBeat(d.product, d.demo, s, verdict.verdict, s.finished);
  });
  s.on('fallback', (reason) => { if (session !== s) return; emit('fallback', { reason }); ui?.fallback(reason); });
  s.on('error', (err) => { console.warn('[keephard]', err); ui?.error(String((err as any)?.message || err)); });
  return s.start().catch((err) => { emit('fallback', { reason: String(err) }); ui?.fallback(String(err)); });
}

window.addEventListener('keephard:start', (e) => {
  const d = readDetail(e);
  if (!d) return; // null detail (cross-world object) or bad JSON
  if (!d.product) { emit('fallback', { reason: 'keephard:start missing product' }); return; }
  void startSession(d);
});

window.addEventListener('keephard:say', (e) => {
  const d = readDetail(e);
  if (!d?.text) return;
  if (session) void session.say(d.text, d.state);
  else {
    // no active interrogation: one-off TTS (e.g. savings line)
    const s = createInterrogation({ profile: demoProfile as any, product: {} as any, backendUrl: BACKEND, fetch: proxyFetch });
    s.on('state', (state) => emit('state', { state }));
    s.on('error', (err) => { console.warn('[keephard]', err); ui?.error(String((err as any)?.message || err)); });
    void s.say(d.text, d.state);
  }
});

window.addEventListener('keephard:search', (e) => {
  const d = readDetail(e);
  void doSearch(d?.product || lastProduct || DEMO_PRODUCT, d?.demo ?? lastDemo);
});

window.addEventListener('keephard:getsavings', () => {
  void readSavings().then((v) => emit('savingslist', v));
});

window.addEventListener('keephard:typed', (e) => {
  const d = readDetail(e);
  if (session && d?.text) void session.submitTyped(d.text);
});

window.addEventListener('keephard:setautoredirect', (e) => {
  const d = readDetail(e);
  autoRedirect = d ? d.enabled !== false : true;
  emit('settings', { enabled, demo: demoMode, autoRedirect });
});

window.addEventListener('keephard:stop', () => { offerGen++; stop(); cancelAuto(); ui?.peek(false); ui?.hideOffer(); ui?.state('idle'); });

// ---------- floating test button + panel (shadow DOM, immune to host CSS) ----------

let audioCtx: AudioContext | undefined;
async function unlockAudio() {
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  audioCtx = audioCtx || new Ctx();
  await audioCtx.resume();
  const b = audioCtx.createBuffer(1, 1, 22050); // silent tick
  const src = audioCtx.createBufferSource();
  src.buffer = b; src.connect(audioCtx.destination); src.start(0);
  // also unlock HTMLAudioElement playback (sticky user activation covers later programmatic play())
  const a = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAABErAAABAAgAZGF0YQAAAAA=');
  a.volume = 0;
  await a.play().catch(() => {});
}

const DEMO_PRODUCT = {
  title: 'Nike Air Zoom Pegasus 41 Running Shoes', brand: 'Nike', price: 120, currency: 'GBP',
  url: location.href, site: location.hostname.replace(/^www\./, ''),
};

const PANEL_HTML = `
<style>
:host{all:initial}
*{box-sizing:border-box;font-family:system-ui,sans-serif}
.wrap{position:fixed;left:16px;bottom:16px;z-index:2147483647;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
button{background:#111;color:#fff;border:2px solid #f5c518;border-radius:999px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.4)}
.panel{display:none;width:300px;max-height:320px;background:#fff;color:#111;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.4);padding:10px;font-size:12px}
.panel.open{display:flex;flex-direction:column;gap:6px}
.state{font-weight:700}
.log{overflow:auto;max-height:180px;display:flex;flex-direction:column;gap:3px}
.u{color:#0a58ca}.a{color:#7a1f1f}
.err{display:none;background:#fde8e8;color:#9b1c1c;padding:5px;border-radius:5px;word-break:break-word}
.res{display:none;background:#e8f7ec;border-radius:5px;padding:6px;line-height:1.4}.res.open{display:block}
.typed{display:none;gap:4px}.typed.open{display:flex}
input{flex:1;padding:4px;font-size:12px;border:1px solid #888;border-radius:4px}
.typed button{padding:4px 8px;font-size:12px;border-radius:4px;border-width:1px}
.peek{display:none;position:fixed;right:16px;bottom:16px;z-index:2147483647;width:280px;background:#111;color:#fff;border:2px solid #f5c518;border-radius:18px;box-shadow:0 8px 28px rgba(0,0,0,.5);padding:10px 12px;gap:10px;align-items:flex-start;font-size:13px;line-height:1.35}
.peek.open{display:flex}
.av{flex:none;width:46px;height:46px;animation:bob 2.2s ease-in-out infinite}
.av svg{width:100%;height:100%;overflow:visible}
.av .face{fill:#f5c518;stroke:#111;stroke-width:2}
.av .eye{fill:#111;transform-box:fill-box;transform-origin:center;animation:blink 4s infinite}
.av .brow{stroke:#111;stroke-width:2.5;stroke-linecap:round;transform-box:fill-box;transform-origin:center}
.av .mo{display:none;fill:#111;stroke:#111;stroke-width:2;stroke-linecap:round;transform-box:fill-box;transform-origin:center}
.av .mo.n{display:block}
.av .mo.sm,.av .mo.fr{fill:none}
.av.happy .mo.n,.av.sad .mo.n{display:none}.av.happy .mo.sm{display:block}.av.sad .mo.fr{display:block}
.av.talk .mo.n{animation:talk .22s ease-in-out infinite alternate}
.av.listen .eye{transform:scale(1.35)}.av.listen .brow{transform:translateY(-2px)}
.av.sad .bl{transform:rotate(18deg)}.av.sad .br{transform:rotate(-18deg)}
.av.happy .brow{transform:translateY(-1.5px)}
.av.live{filter:drop-shadow(0 0 6px rgba(245,197,24,.9))}
.peek.open{animation:pop .35s cubic-bezier(.34,1.56,.64,1)}
.peek.small{width:210px;padding:6px 8px;font-size:11px;animation:none}.peek.small .av{width:28px;height:28px}
.toast{display:none;position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483647;background:#111;color:#f5c518;border-radius:999px;padding:6px 14px;font:600 12px system-ui,sans-serif}.toast.open{display:block}
@keyframes pop{0%{transform:scale(.3);opacity:0}60%{transform:scale(1.08);opacity:1}100%{transform:scale(1)}}
@keyframes bob{50%{transform:translateY(-3px)}}
@keyframes talk{from{transform:scaleY(.4)}to{transform:scaleY(1.6)}}
@keyframes blink{0%,94%,100%{transform:scaleY(1)}97%{transform:scaleY(.1)}}
.pbody{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.pcap{max-height:70px;overflow:hidden}.pme{color:#9cc4ff;font-size:12px}
.px{position:absolute;top:2px;right:6px;background:none;border:0;color:#aaa;font-size:16px;padding:0;box-shadow:none;cursor:pointer}
.ptyped{display:none;gap:4px}.ptyped.open{display:flex}
.offer{display:none;position:fixed;right:16px;bottom:16px;z-index:2147483647;width:300px;background:#fff;color:#111;border-radius:14px;box-shadow:0 10px 32px rgba(0,0,0,.45);padding:14px;font-size:13px;flex-direction:column;gap:6px;border-top:4px solid #f5c518}
.offer.open{display:flex}
.otitle{font-weight:700;font-size:14px;line-height:1.3}.oret{color:#555}.oprice{font-size:22px;font-weight:800}
.badge{align-self:flex-start;background:#0a7a3b;color:#fff;border-radius:999px;padding:3px 10px;font-weight:700;font-size:12px}
.obtns{display:flex;gap:8px;margin-top:6px}
.obtns .buy{flex:1;background:#f5c518;color:#111;border:0;border-radius:8px;padding:10px;font-weight:800}
.obtns .no{background:#fff;color:#444;border:1px solid #bbb;border-radius:8px;padding:10px;box-shadow:none}
.cd{display:none;align-items:center;gap:8px;font-weight:700;color:#0a7a3b}.cd.open{display:flex}.cd span{flex:1}
.cd button{background:#fff;color:#444;border:1px solid #bbb;border-radius:8px;padding:6px 10px;box-shadow:none}
.tap{display:none;position:fixed;right:20px;bottom:20px;z-index:2147483647;background:#f5c518;color:#111;border-radius:999px;padding:16px 24px;font-size:18px;font-weight:800;cursor:pointer;box-shadow:0 0 0 0 rgba(245,197,24,.7);animation:ring 1.5s infinite}
.tap.open{display:block}
@keyframes ring{0%{box-shadow:0 0 0 0 rgba(245,197,24,.7)}100%{box-shadow:0 0 0 26px rgba(245,197,24,0)}}
@keyframes pulse{50%{transform:scale(1.12)}}
</style>
<div class="peek"><button class="px" title="Close">&times;</button><div class="av"><svg viewBox="0 0 46 46"><circle class="face" cx="23" cy="23" r="20"/>
<line class="brow bl" x1="11" y1="14" x2="19" y2="14"/><line class="brow br" x1="27" y1="14" x2="35" y2="14"/>
<circle class="eye" cx="16" cy="20" r="2.6"/><circle class="eye" cx="30" cy="20" r="2.6"/>
<ellipse class="mo n" cx="23" cy="32" rx="5" ry="2"/><path class="mo sm" d="M14 29 Q23 40 32 29"/><path class="mo fr" d="M15 34 Q23 27 31 34"/></svg></div>
  <div class="pbody"><div class="pcap"></div><div class="pme"></div>
    <div class="ptyped"><input placeholder="Type your reason..."><button>Send</button></div></div></div>
<div class="offer"><div class="otitle"></div><div class="oret"></div><div class="oprice"></div><div class="badge"></div><div class="obtns"><button class="buy">Buy it cheaper</button><button class="no">No thanks</button></div><div class="cd"><span></span><button class="stay">Stay here</button></div></div>
<div class="toast"></div>
<div class="tap">Tap anywhere to talk</div>
<div class="wrap">
  <div class="panel"><div class="state">state: idle</div><div class="err"></div><div class="log"></div>
    <div class="res"></div>
    <div class="typed"><input placeholder="Type your reason..."><button>Send</button></div></div>
  <button class="go">Start KeepHard (test)</button>
  <button class="skip">Skip to savings</button>
</div>`;

class Panel {
  private host = document.createElement('div');
  private root = this.host.attachShadow({ mode: 'open' });
  private log: HTMLElement;
  private stateEl: HTMLElement;
  private err: HTMLElement;
  private typed: HTMLElement;
  private input: HTMLInputElement;
  private panel: HTMLElement;
  private res: HTMLElement;
  private offerEl!: HTMLElement;
  private peekEl!: HTMLElement; private pcap!: HTMLElement; private pme!: HTMLElement; private av!: HTMLElement;
  private ptyped!: HTMLElement; private tapEl!: HTMLElement; private hideT: any;

  constructor() {
    this.root.innerHTML = PANEL_HTML;
    const q = (s: string) => this.root.querySelector(s) as HTMLElement;
    this.panel = q('.panel'); this.log = q('.log'); this.stateEl = q('.state'); this.err = q('.err');
    this.typed = q('.typed'); this.input = q('input') as HTMLInputElement;
    this.res = q('.res'); this.offerEl = q('.offer');
    this.peekEl = q('.peek'); this.pcap = q('.pcap'); this.pme = q('.pme'); this.av = q('.av');
    this.ptyped = q('.ptyped'); this.tapEl = q('.tap');
    q('.px').addEventListener('click', () => closeAll('user closed'));
    const pin = q('.ptyped input') as HTMLInputElement;
    const psend = () => { const t = pin.value.trim(); if (t && session) { pin.value = ''; void session.submitTyped(t); } };
    q('.ptyped button').addEventListener('click', psend);
    pin.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') psend(); });
    pin.addEventListener('keyup', (ev) => ev.stopPropagation());
    pin.addEventListener('keypress', (ev) => ev.stopPropagation());
    q('.go').addEventListener('click', () => void this.onClick());
    q('.skip').addEventListener('click', () => void this.onSkip());
    const send = () => {
      const t = this.input.value.trim();
      if (t && session) { this.input.value = ''; void session.submitTyped(t); }
    };
    q('.typed button').addEventListener('click', send);
    this.input.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') send(); });
    this.input.addEventListener('keyup', (ev) => ev.stopPropagation());
    this.input.addEventListener('keypress', (ev) => ev.stopPropagation());
    (document.body || document.documentElement).appendChild(this.host);
  }

  private async onClick() {
    this.panel.classList.add('open');
    this.err.style.display = 'none'; this.typed.classList.remove('open'); this.log.textContent = '';
    try { await unlockAudio(); } catch (e) { this.error('Audio unlock failed: ' + String((e as any)?.message || e)); }
    // probe the mic first so a denial is visible instead of a silent fallback
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true });
      st.getTracks().forEach((t) => t.stop());
    } catch (e) {
      this.error('Microphone denied/unavailable (' + String((e as any)?.name || e) + '). Allow it via the extension Options page, or use typed input.');
      this.typed.classList.add('open');
    }
    this.state('connecting');
    await startSession({ product: DEMO_PRODUCT }, true);
  }

  private async onSkip() {
    this.panel.classList.add('open');
    try { await unlockAudio(); } catch { /* ignore */ }
    await offerBeat(lastProduct || DEMO_PRODUCT, lastDemo);
  }

  result(r: any) {
    this.panel.classList.add('open');
    this.res.textContent = '';
    if (!r || !r.found || !r.alternative) { this.res.classList.remove('open'); return; }
    const a = r.alternative;
    const lines = [a.title, 'Retailer: ' + a.retailer, 'Price: £' + Number(a.price).toFixed(2), 'You save: £' + Number(r.savings).toFixed(2)];
    lines.forEach((t, i) => { const d = document.createElement('div'); d.textContent = t; if (i === 0 || i === 3) d.style.fontWeight = '700'; this.res.appendChild(d); });
    this.res.classList.add('open');
  }

  private cdT: any;
  hideOffer() { clearInterval(this.cdT); (this.offerEl.querySelector('.cd') as HTMLElement)?.classList.remove('open'); this.offerEl.classList.remove('open'); }
  countdown(n: number, go: () => void, cancel: () => void) {
    const cd = this.offerEl.querySelector('.cd') as HTMLElement, sp = cd.querySelector('span') as HTMLElement;
    const o = cd.querySelector('.stay') as HTMLElement, st = o.cloneNode(true) as HTMLElement; o.replaceWith(st);
    st.addEventListener('click', () => { clearInterval(this.cdT); cancel(); });
    clearInterval(this.cdT);
    let left = n;
    const tick = () => { if (left <= 0) { clearInterval(this.cdT); go(); return; } sp.textContent = `Taking you there in ${left}...`; left--; };
    cd.classList.add('open'); tick();
    this.cdT = setInterval(tick, 1000);
  }
  offer(r: any, done: (opened: boolean) => void) {
    const a = r.alternative, q = (s: string) => this.offerEl.querySelector(s) as HTMLElement;
    q('.otitle').textContent = a.title;
    const col = a.colour || a.color || r.matchedColour || r.colour || r.matchedColor;
    q('.oret').textContent = a.retailer + (col ? ' · ' + col : '');
    q('.oprice').textContent = '£' + Number(a.price).toFixed(2);
    q('.badge').textContent = 'Save £' + Number(r.savings).toFixed(2);
    const fresh = (sel: string) => { const o = q(sel); const n = o.cloneNode(true) as HTMLElement; o.replaceWith(n); return n; };
    const hide = () => { this.hideOffer(); clearTimeout(this.hideT); };
    fresh('.buy').addEventListener('click', () => { hide(); done(true); });
    fresh('.no').addEventListener('click', () => { hide(); done(false); });
    this.peekEl.classList.remove('open');
    this.offerEl.classList.add('open');
  }
  /** fade the bubble out over ms (closeAll finishes the job) */
  fadeOut(ms: number) { this.peekEl.style.transition = 'opacity ' + Math.min(ms, 800) + 'ms ease ' + Math.max(0, ms - 800) + 'ms'; this.peekEl.style.opacity = '0'; }
  /** remove every visible surface */
  dismiss() {
    clearTimeout(this.hideT); this.hideT = undefined; this.hideOffer();
    this.peek(false); this.peekEl.style.transition = ''; this.peekEl.style.opacity = '';
    this.panel.classList.remove('open'); this.res.classList.remove('open'); this.err.style.display = 'none';
    this.tapEl.classList.remove('open'); this.typed.classList.remove('open');
    const t = this.root.querySelector('.toast') as HTMLElement; t?.classList.remove('open');
    this.state('idle');
  }
  toast(t: string) { const el = this.root.querySelector('.toast') as HTMLElement; el.textContent = t; el.classList.add('open'); setTimeout(() => el.classList.remove('open'), 2200); }
  peek(on: boolean) {
    if (on) this.peekEl.classList.toggle('small', mascotPresent());
    const was = this.peekEl.classList.contains('open');
    this.peekEl.classList.toggle('open', on);
    if (on) { this.peekEl.style.transition = ''; this.peekEl.style.opacity = ''; }
    if (on !== was) emit('peek', { on }); if (!on) { this.pcap.textContent = ''; this.pme.textContent = ''; this.ptyped.classList.remove('open'); } }
  impact(_price: number, _tone?: string) { /* standalone panel has no dashboard */ }
  hideTest() { (this.root.querySelector('.go') as HTMLElement).style.display = 'none'; (this.root.querySelector('.skip') as HTMLElement).style.display = 'none'; }
  tap(on: boolean) { this.tapEl.classList.toggle('open', on); }
  typedOpen() { this.ptyped.classList.add('open'); }
  /** after the final verdict: hide the bubble a while after the last caption */
  scheduleHide(ms = 15000) { clearTimeout(this.hideT); this.hideT = setTimeout(() => this.peek(false), ms); }
  state(s: string) {
    this.stateEl.textContent = 'state: ' + s;
    const talk = s === 'speaking' || s === 'talking';
    this.av.classList.toggle('live', talk || s === 'listening' || s === 'connecting');
    this.av.classList.toggle('talk', talk);
    this.av.classList.toggle('listen', s === 'listening');
    this.av.classList.toggle('happy', s === 'happy');
    this.av.classList.toggle('sad', s === 'disappointed');
  }
  caption(text: string, who: 'avatar' | 'user') {
    if (this.peekEl.classList.contains('open')) {
      const brief = text.length > 110 ? text.slice(0, 110).replace(/\s+\S*$/, '') + '...' : text;
      if (who === 'user') this.pme.textContent = 'You: ' + brief; else { this.pcap.textContent = brief; this.pme.textContent = ''; }
      if (this.hideT) this.scheduleHide();
    }
    const d = document.createElement('div');
    d.className = who === 'user' ? 'u' : 'a';
    d.textContent = (who === 'user' ? 'You: ' : 'KeepHard: ') + text;
    this.log.appendChild(d);
    this.log.scrollTop = this.log.scrollHeight;
  }
  error(msg: string) { this.panel.classList.add('open'); this.err.style.display = 'block'; this.err.textContent = msg; }
  fallback(reason: string) {
    this.error('Voice fallback: ' + reason);
    this.typed.classList.add('open');
    this.typedOpen();
  }
}

const IMPACT_LINE = 'Buy these and your flight home slips. Here is a cheaper pair.';
const CAUTION_LINE = 'Careful, though. Look at what this does to your goal.';

/** Headless UI: same method surface as Panel, but everything goes out as `keephard:ui` events
 *  ({kind, ...}) and comes back as `keephard:offerchoice {buy}` / `keephard:stay`. */
const NETWORKISH = /fetch|network|http|timed out|timeout|speak \d|session \d|judge \d|disconnect|no response|not allowed|audio|WebSocket|ElevenLabs|connect/i;
class EventUi {
  private offerDone?: (opened: boolean) => void;
  private cdCancel?: () => void;
  private cdT: any; private hideT: any;
  private peekOn = false;
  constructor() {
    window.addEventListener('keephard:offerchoice', (e) => {
      const d = readDetail(e); const f = this.offerDone;
      if (!d || !f) return;
      this.offerDone = undefined; this.hideOffer(); f(!!d.buy);
    });
    window.addEventListener('keephard:stay', () => {
      clearInterval(this.cdT); const c = this.cdCancel; this.cdCancel = undefined; this.offerDone = undefined; c?.();
    });
  }
  private ui(kind: string, extra: Record<string, unknown> = {}) { emit('ui', { kind, ...extra }); }
  result(_r: any) { /* the offer card carries the result */ }
  hideOffer() { clearInterval(this.cdT); this.cdCancel = undefined; this.ui('hideoffer'); }
  countdown(n: number, go: () => void, cancel: () => void) {
    clearInterval(this.cdT); this.cdCancel = cancel;
    let left = n;
    const tick = () => { if (left <= 0) { clearInterval(this.cdT); this.cdCancel = undefined; go(); return; } this.ui('countdown', { left }); left--; };
    tick(); this.cdT = setInterval(tick, 1000);
  }
  offer(r: any, done: (opened: boolean) => void) { this.offerDone = done; this.ui('offer', { result: r }); }
  pauseCountdown() { clearInterval(this.cdT); this.cdCancel = undefined; this.ui('countdown', { left: 0 }); }
  impact(price: number, tone = 'reject') { this.ui('impact', { price, tone, goal: (demoProfile as any).goal }); }
  recovered(price: number, amount: number) { this.ui('recovered', { price, amount }); }
  toast(t: string) { this.ui('toast', { text: t }); }
  peek(on: boolean) {
    if (on === this.peekOn) return;
    this.peekOn = on; emit('peek', { on }); this.ui('peek', { on });
  }
  hideTest() { /* no test buttons when integrated */ }
  tap(on: boolean) { this.ui('tap', { on }); }
  typedOpen() { this.ui('typedopen'); }
  scheduleHide(ms = 15000) { clearTimeout(this.hideT); this.hideT = setTimeout(() => this.peek(false), ms); }
  fadeOut(ms = 4000) { this.scheduleHide(ms); }
  dismiss() { this.hideOffer(); this.peek(false); }
  state(s: string) { this.ui('state', { state: s }); }
  caption(text: string, who: 'avatar' | 'user') { this.ui('caption', { text, who }); }
  /** network / proxy / audio failures are logged only, never shown to the user */
  error(msg: string) { if (NETWORKISH.test(msg) && !/microphone|mic /i.test(msg)) { console.warn('[keephard] hidden error:', msg); return; } this.ui('error', { text: msg }); }
  fallback(reason: string) { console.warn('[keephard] voice fallback:', reason); this.ui('typedopen'); }
}

function mountUi() {
  try { ui = integrated ? (new EventUi() as unknown as Panel) : new Panel(); } catch (e) { console.warn('[keephard] UI mount failed', e); }
}
if (window.top === window) {
  if (document.body) mountUi(); else document.addEventListener('DOMContentLoaded', mountUi);
}

// ---------- auto-start on Amazon Nike shoe product pages ----------
const K_ENABLED = 'keephard.enabled', K_DEMO = 'keephard.demo';
let enabled = true;
let demoMode = true;
const triggered = new Set<string>(); // once per product per page load
let curKey = '';
let titleSeenAt = 0;
let checkT: any;
let gestureArmed = false;
let pendingProduct: any;
const GESTURES = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'];

function ensureUi(): Panel | undefined { if (!ui && window.top === window) mountUi(); return ui; }

function productKey(): string {
  const m = location.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{8,12})/i);
  return m ? m[1]!.toUpperCase() : '';
}

// AudioContext.resume() does not reject when autoplay-blocked, it stays pending: race it with a timeout.
async function tryUnlockAudio(): Promise<boolean> {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = audioCtx || new Ctx();
    await Promise.race([audioCtx.resume(), new Promise((r) => setTimeout(r, 400))]);
    if (audioCtx.state !== 'running') return false;
    const a = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAABErAAABAAgAZGF0YQAAAAA=');
    a.volume = 0;
    await a.play(); // rejects with NotAllowedError when blocked
    return true;
  } catch { return false; }
}

async function beginSession(product: any) {
  const p = ensureUi();
  p?.tap(false); p?.peek(true); p?.state('connecting');
  p?.caption('Allow the mic to talk', 'avatar');
  p?.hideTest();
  const short = String(product?.title || 'those').split(/[,(-]/)[0]!.trim().slice(0, 50);
  // probe the mic so a denial / dismissed prompt is visible; typed input is the fallback
  try {
    if (!micGranted) { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); st.getTracks().forEach((t) => t.stop()); }
  } catch (e) {
    console.warn('[keephard] mic unavailable:', e);
    p?.typedOpen();
    p?.error('Mic blocked: click the lock icon in the address bar, allow microphone. (' + String((e as any)?.name || e) + ')');
    p?.caption('Mic blocked. Type your reason below.', 'avatar');
  }
  await startSession({ product, demo: demoMode });
}

function disarmGesture() {
  if (!gestureArmed) return;
  gestureArmed = false;
  for (const t of GESTURES) window.removeEventListener(t, onGesture, true);
}
async function onGesture() {
  if (!pendingProduct) { disarmGesture(); return; }
  // scroll/wheel are NOT user activations in Chrome: if the unlock fails and there is no activation, keep waiting.
  const ok = await tryUnlockAudio();
  if (!ok && !(navigator as any).userActivation?.isActive) return;
  const prod = pendingProduct; pendingProduct = undefined; disarmGesture();
  await beginSession(prod);
}
function armGesture() {
  if (gestureArmed) return;
  gestureArmed = true;
  for (const t of GESTURES) window.addEventListener(t, onGesture, { capture: true, passive: true });
}

let uiReady = !integrated;
let uiReadyWake: (() => void) | undefined;
window.addEventListener('keephard:uiready', () => { uiReady = true; uiReadyWake?.(); emit('settings', { enabled, demo: demoMode, autoRedirect, integrated }); });

async function autoStart(product: any) {
  if (session) return; // an interrogation is already running (manual start)
  if (!uiReady) await new Promise<void>((r) => { uiReadyWake = r; setTimeout(r, 3000); }); // host UI mounts at document_idle
  if (session) return;
  emit('detected', { product });
  prewarmSession(product);
  // search prefetch: backend runs the live search in the background so the real call answers from memory
  proxyFetch(BACKEND + '/api/search?prefetch=1', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product }) }).catch(() => {});
  ensureUi();
  if (await tryUnlockAudio()) { await beginSession(product); return; }
  // autoplay blocked: friendly bubble, start on the first real gesture
  pendingProduct = product;
  ui?.tap(true);
  armGesture();
}

function cancelAuto() { pendingProduct = undefined; disarmGesture(); ui?.tap(false); }

function check() {
  if (window.top !== window) return;
  const key = productKey();
  if (key !== curKey) { // SPA-ish navigation (or first run)
    if (curKey) { stop(); ui?.peek(false); }
    cancelAuto();
    curKey = key; titleSeenAt = 0;
  }
  if (!enabled || !key || !isProductUrl(location.href) || triggered.has(key) || wasDone(prodKey({ url: location.href }))) return;
  let r = detectProduct(document, location.href, { demo: false, fast: true });
  if (!r.product && r.reason === 'no price yet' && demoMode) {
    titleSeenAt = titleSeenAt || Date.now();
    const wait = 400 - (Date.now() - titleSeenAt); // give the real price a chance to render first
    if (wait > 0) { scheduleCheck(wait + 50); return; }
    r = detectProduct(document, location.href, { demo: true, fast: true });
  }
  if (!r.product) return;
  triggered.add(key);
  void autoStart(r.product);
}

function scheduleCheck(ms = 120) { clearTimeout(checkT); checkT = setTimeout(check, ms); }
// observer variant: do not reset a pending timer, otherwise a busy page starves the debounce forever
function scheduleCheckThrottled() { if (!checkT) scheduleCheck(); }

async function loadSettings() {
  try {
    const o = await chrome.storage.local.get([K_ENABLED, K_DEMO]);
    if (typeof o?.[K_ENABLED] === 'boolean') enabled = o[K_ENABLED];
    if (typeof o?.[K_DEMO] === 'boolean') demoMode = o[K_DEMO];
  } catch { /* defaults */ }
}

window.addEventListener('keephard:setenabled', (e) => {
  const d = readDetail(e);
  enabled = d ? d.enabled !== false : true;
  try { void chrome.storage.local.set({ [K_ENABLED]: enabled }); } catch { /* ignore */ }
  if (!enabled) { stop(); cancelAuto(); ui?.peek(false); } else { triggered.clear(); scheduleCheck(); }
  emit('settings', { enabled, demo: demoMode });
});
window.addEventListener('keephard:setdemo', (e) => {
  const d = readDetail(e);
  demoMode = d ? d.demo !== false : true;
  try { void chrome.storage.local.set({ [K_DEMO]: demoMode }); } catch { /* ignore */ }
  scheduleCheck();
  emit('settings', { enabled, demo: demoMode });
});

function setEnabled(v: boolean) {
  enabled = v;
  try { void chrome.storage.local.set({ [K_ENABLED]: enabled }); } catch { /* ignore */ }
  if (!v) { clearTimers(); stop(); offerGen++; cancelAuto(); ui?.hideOffer(); ui?.peek(false); }
  ensureUi()?.toast('KeepHard ' + (v ? 'ON' : 'OFF'));
  emit('settings', { enabled, demo: demoMode, autoRedirect });
}
if (window.top === window) {
  window.addEventListener('keydown', (e) => {
    if (!e.altKey || !e.shiftKey) return;
    if (e.code === 'KeyK') { e.preventDefault(); setEnabled(!enabled); }
    else if (e.code === 'KeyR') {
      e.preventDefault();
      clearTimers(); stop(); offerGen++; chainBusy = false; cancelAuto(); ui?.hideOffer(); ui?.peek(false);
      clearDone(); triggered.clear(); enabled = true;
      ensureUi()?.toast('KeepHard replay');
      const r = productKey() ? detectProduct(document, location.href, { demo: demoMode }) : undefined;
      void autoStart(r?.product || { ...DEMO_PRODUCT, url: location.href });
    }
  }, true);
}

if (window.top === window) {
  if (isProductUrl(location.href)) prewarmEnv();
  void loadSettings().then(() => {
    check();
    new MutationObserver(() => scheduleCheckThrottled()).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('popstate', () => scheduleCheck());
    let lastHref = location.href;
    setInterval(() => { if (location.href !== lastHref) { lastHref = location.href; scheduleCheck(); } }, 500);
    emit('settings', { enabled, demo: demoMode });
  });
}

emit('ready');
}
