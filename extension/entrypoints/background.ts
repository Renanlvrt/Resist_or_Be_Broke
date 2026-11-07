import { installProxy } from '../../packages/voice/bridge/src/proxy';
// Backend proxy: content scripts on amazon.co.uk cannot call http://localhost:8787 directly (CORS / mixed content).
export default defineBackground(() => {
  installProxy();
  // "Buy it cheaper": open the cheaper pair in a NEW tab (Amazon stays open).
  chrome.runtime.onMessage.addListener((msg: any, _sender: any, reply: (r: unknown) => void) => {
    if (msg?.type !== 'keephard:openTab') return;
    if (/^https?:\/\//.test(String(msg.url))) void chrome.tabs.create({ url: String(msg.url), active: true });
    reply({ ok: true }); // answer so the content script does not fall back to window.open (would open twice)
  });
  // Demo: reloading the extension starts with a clean receipt (drops test-run savings rows).
  browser.runtime.onInstalled.addListener(() => { void browser.storage.local.remove('keephard.savings'); });
});
