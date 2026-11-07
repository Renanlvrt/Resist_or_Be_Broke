// Content script: window CustomEvents <-> @keephard/voice. Backend calls proxied via background.js.
import { createInterrogation, type Interrogation } from '../../src/index';
import demoProfile from '../../../shared/demo-profile.json';

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

const proxyFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  const res: any = await chrome.runtime.sendMessage({
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

function stop() {
  session?.stop();
  session = undefined;
}

function startSession(d: any): Promise<void> {
  stop();
  const s = createInterrogation({
    profile: d.profile || (demoProfile as any),
    product: d.product,
    backendUrl: BACKEND,
    demo: d.demo,
    fetch: proxyFetch,
  });
  session = s;
  s.on('state', (state) => { emit('state', { state }); ui?.state(state); });
  s.on('caption', (text, who) => { emit('caption', { text, who }); ui?.caption(text, who); });
  s.on('verdict', (verdict) => { emit('verdict', { verdict }); ui?.caption(`Verdict: ${verdict.verdict} (${verdict.reasonCategory})`, 'avatar'); });
  s.on('fallback', (reason) => { emit('fallback', { reason }); ui?.fallback(reason); });
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

window.addEventListener('keephard:typed', (e) => {
  const d = readDetail(e);
  if (session && d?.text) void session.submitTyped(d.text);
});

window.addEventListener('keephard:stop', () => { stop(); ui?.state('idle'); });

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
.typed{display:none;gap:4px}.typed.open{display:flex}
input{flex:1;padding:4px;font-size:12px;border:1px solid #888;border-radius:4px}
.typed button{padding:4px 8px;font-size:12px;border-radius:4px;border-width:1px}
</style>
<div class="wrap">
  <div class="panel"><div class="state">state: idle</div><div class="err"></div><div class="log"></div>
    <div class="typed"><input placeholder="Type your reason..."><button>Send</button></div></div>
  <button class="go">Start KeepHard (test)</button>
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

  constructor() {
    this.root.innerHTML = PANEL_HTML;
    const q = (s: string) => this.root.querySelector(s) as HTMLElement;
    this.panel = q('.panel'); this.log = q('.log'); this.stateEl = q('.state'); this.err = q('.err');
    this.typed = q('.typed'); this.input = q('input') as HTMLInputElement;
    q('.go').addEventListener('click', () => void this.onClick());
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
    await startSession({ product: DEMO_PRODUCT });
  }

  state(s: string) { this.stateEl.textContent = 'state: ' + s; }
  caption(text: string, who: 'avatar' | 'user') {
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
  }
}

function mountUi() {
  try { ui = new Panel(); } catch (e) { console.warn('[keephard] UI mount failed', e); }
}
if (window.top === window) {
  if (document.body) mountUi(); else document.addEventListener('DOMContentLoaded', mountUi);
}

emit('ready');
