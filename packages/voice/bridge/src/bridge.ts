// Content script: window CustomEvents <-> @keephard/voice. Backend calls proxied via background.js.
import { createInterrogation, type Interrogation } from '../../src/index';
import demoProfile from '../../../shared/demo-profile.json';

const BACKEND = 'http://localhost:8787';
const emit = (name: string, detail?: unknown) =>
  window.dispatchEvent(new CustomEvent('keephard:' + name, { detail }));

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

function stop() {
  session?.stop();
  session = undefined;
}

window.addEventListener('keephard:start', async (e) => {
  const d = (e as CustomEvent).detail || {};
  if (!d.product) { emit('fallback', { reason: 'keephard:start missing product' }); return; }
  stop();
  const s = createInterrogation({
    profile: d.profile || (demoProfile as any),
    product: d.product,
    backendUrl: BACKEND,
    demo: d.demo,
    fetch: proxyFetch,
  });
  session = s;
  s.on('state', (state) => emit('state', { state }));
  s.on('caption', (text, who) => emit('caption', { text, who }));
  s.on('verdict', (verdict) => emit('verdict', { verdict }));
  s.on('fallback', (reason) => emit('fallback', { reason }));
  s.on('error', (err) => console.warn('[keephard]', err));
  try { await s.start(); } catch (err) { emit('fallback', { reason: String(err) }); }
});

window.addEventListener('keephard:say', (e) => {
  const d = (e as CustomEvent).detail || {};
  if (!d.text) return;
  if (session) void session.say(d.text, d.state);
  else {
    // no active interrogation: one-off TTS (e.g. savings line)
    const s = createInterrogation({ profile: demoProfile as any, product: {} as any, backendUrl: BACKEND, fetch: proxyFetch });
    s.on('state', (state) => emit('state', { state }));
    void s.say(d.text, d.state);
  }
});

window.addEventListener('keephard:typed', (e) => {
  const d = (e as CustomEvent).detail || {};
  if (session && d.text) void session.submitTyped(d.text);
});

window.addEventListener('keephard:stop', stop);

emit('ready');
