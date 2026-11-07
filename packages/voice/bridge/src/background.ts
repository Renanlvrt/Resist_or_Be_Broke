// Standalone service worker entry (old build). Integrated build uses extension/entrypoints/background.ts.
import { installProxy } from './proxy';
installProxy();
