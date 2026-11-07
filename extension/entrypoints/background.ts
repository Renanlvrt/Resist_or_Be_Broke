import { installProxy } from '../../packages/voice/bridge/src/proxy';
// Backend proxy: content scripts on amazon.co.uk cannot call http://localhost:8787 directly (CORS / mixed content).
export default defineBackground(() => {
  installProxy();
  // Demo: reloading the extension starts with a clean receipt (drops test-run savings rows).
  browser.runtime.onInstalled.addListener(() => { void browser.storage.local.remove('keephard.savings'); });
});
