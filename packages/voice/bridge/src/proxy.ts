// Background service worker: all backend network calls go through here (no page CORS / mixed content).
const ALLOWED = ['http://localhost:8787/', 'http://127.0.0.1:8787/'];

function b64(buf: ArrayBuffer): string {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

export function installProxy(): void {
chrome.runtime.onMessage.addListener((msg: any, _sender: any, reply: (r: unknown) => void) => {
  if (!msg || msg.type !== 'keephard:fetch') return;
  const { url, method, headers, body } = msg;
  if (!ALLOWED.some((p) => String(url).startsWith(p))) {
    reply({ error: 'url not allowed' });
    return;
  }
  fetch(url, { method: method || 'GET', headers, body })
    .then(async (r) => {
      const buf = await r.arrayBuffer();
      reply({ ok: r.ok, status: r.status, contentType: r.headers.get('content-type') || '', body: b64(buf) });
    })
    .catch((e) => reply({ error: String(e?.message || e) }));
  return true; // async reply
});
}
