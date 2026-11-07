# Bridge test

1. `node scripts/make-extension.mjs`, load `chrome-mv3-voice/` unpacked (reload it after every rebuild), start the backend (`cd backend && npm start`).
2. Open an amazon.co.uk page. Bottom-left there is a black/yellow **Start KeepHard (test)** button. This is the primary test.
   - Click it (the click is the user gesture that unlocks audio). Allow the mic prompt (or enable it on the extension Options page).
   - The panel shows state, live captions (You / KeepHard), and a red error line for any failure (mic denied, audio blocked, backend down).
   - If voice falls back, a typed input appears; type a reason and press Enter.
3. Event bus (optional). The console runs in the page's main world, and object `detail` from the main world arrives as `null` in the extension's isolated world. Either pick the extension's content script context in the DevTools console context dropdown (top-left of console, "KeepHard + Voice"), or send JSON strings from the page context:

```js
// listen (main world): JSON-string copies of every event are on keephard-json:*
['ready','state','caption','verdict','fallback'].forEach(n => window.addEventListener('keephard-json:'+n, e => console.log(n, JSON.parse(e.detail))));
// start (JSON string detail works from either world)
window.dispatchEvent(new CustomEvent('keephard:start', { detail: JSON.stringify({ product: {
  title: 'Nike Air Zoom Pegasus 41 Running Shoes', brand: 'Nike', price: 120, currency: 'GBP',
  url: location.href, site: 'amazon.co.uk' } }) }));
// typed:  window.dispatchEvent(new CustomEvent('keephard:typed',{detail:JSON.stringify({text:'I need them for track'})}))
// say:    window.dispatchEvent(new CustomEvent('keephard:say',{detail:JSON.stringify({text:'You saved 40 pounds.',state:'happy'})}))
// stop:   window.dispatchEvent(new Event('keephard:stop'))
```

Audio from the console needs a prior user gesture on the page (click the Start button once, or anywhere on the page) because of Chrome's autoplay policy.

Event contract: incoming `keephard:*` accept `detail` as an object or a JSON string. Outgoing events are sent twice: `keephard:<name>` (object detail, for isolated-world code) and `keephard-json:<name>` (JSON string detail, for main-world listeners).
Known risk: audio plays from a blob: URL; if the host page CSP blocks `media-src blob:`, the WebAudio fallback is used and any failure is shown in the panel and console.
