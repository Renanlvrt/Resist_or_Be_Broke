// KeepHard voice bridge as a second content script (same isolated world as Pocket's UI).
// Runs at document_start for fast shoe detection. All side effects happen inside main():
// WXT imports this file in Node at build time, so nothing may touch window/chrome at module scope.
export default defineContentScript({
  matches: ['https://www.amazon.co.uk/*'],
  runAt: 'document_start',
  async main() {
    const { initBridge } = await import('../../packages/voice/bridge/src/bridge');
    initBridge({ integrated: true });
  },
});
