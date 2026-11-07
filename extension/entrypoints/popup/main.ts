import { browser } from 'wxt/browser';
const input = document.querySelector<HTMLInputElement>('#muted')!;
const status = document.querySelector<HTMLElement>('#status')!;
void browser.storage.local.get('pocket-sound-muted').then(value => { input.checked = value['pocket-sound-muted'] === true; });
input.addEventListener('change', () => { void browser.storage.local.set({ 'pocket-sound-muted': input.checked }); });
document.querySelector('#developer')!.addEventListener('click', async () => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');
    await browser.tabs.sendMessage(tab.id, { type: 'POCKET_OPEN_LAB' });
    window.close();
  } catch { status.textContent = 'Open Amazon UK or the local mock shop, then reload the page and try again.'; }
});
