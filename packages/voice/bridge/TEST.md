# Bridge test

1. `node scripts/make-extension.mjs`, load `chrome-mv3-voice/` unpacked, start the backend (`cd backend && npm start`).
2. Open an amazon.co.uk page, open DevTools console (page context, "top"), paste:

```js
['ready','state','caption','verdict','fallback'].forEach(n => window.addEventListener('keephard:'+n, e => console.log('keephard:'+n, e.detail)));
window.dispatchEvent(new CustomEvent('keephard:start', { detail: { product: {
  title: 'Nike Air Zoom Pegasus 41 Running Shoes', brand: 'Nike', price: 120, currency: 'GBP',
  url: location.href, site: 'amazon.co.uk' } } }));
// typed fallback: window.dispatchEvent(new CustomEvent('keephard:typed',{detail:{text:'I need them for track'}}))
// say:            window.dispatchEvent(new CustomEvent('keephard:say',{detail:{text:'You saved 40 pounds.',state:'happy'}}))
// stop:           window.dispatchEvent(new Event('keephard:stop'))
```

Events carry plain JSON `detail` only. Content scripts share the DOM event bus with the page, but the page and content script have separate JS worlds, so only JSON-serialisable detail is readable on both sides (that is all the bridge sends).
Known risk: audio plays from a blob: URL; if the host page CSP blocks `media-src blob:`, TTS is silent (check the console).
