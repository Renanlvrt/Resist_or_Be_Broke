// Service worker: relays backend calls so content scripts aren't subject to the shop's CORS.
// Only ever forwards what the content script built (item, price, category, computed numbers, rule text).
export interface BackendRequest {
  type: 'backend';
  path: string;
  body: unknown;
  timeoutMs: number;
}

export type BackendResponse = { ok: true; data: unknown } | { ok: false; error: string };

chrome.runtime.onMessage.addListener((msg: BackendRequest, _sender, sendResponse) => {
  if (msg?.type !== 'backend') return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), msg.timeoutMs);
  fetch(`${__BACKEND_URL__}${msg.path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(msg.body),
    signal: ctrl.signal,
  })
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      sendResponse({ ok: true, data: await r.json() } satisfies BackendResponse);
    })
    .catch((e: unknown) => sendResponse({ ok: false, error: String(e) } satisfies BackendResponse))
    .finally(() => clearTimeout(timer));
  return true; // async response
});
