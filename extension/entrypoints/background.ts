import { installProxy } from '../../packages/voice/bridge/src/proxy';
// Backend proxy: content scripts on amazon.co.uk cannot call http://localhost:8787 directly (CORS / mixed content).
export default defineBackground(() => { installProxy(); });
