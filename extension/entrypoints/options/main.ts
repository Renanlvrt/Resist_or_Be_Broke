const status = document.getElementById('s')!;
document.getElementById('b')!.addEventListener('click', async () => {
  try {
    (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach(t => t.stop());
    status.textContent = 'Microphone allowed.';
  } catch (e) { status.textContent = 'Denied: ' + (e instanceof Error ? e.message : String(e)); }
});

const KEY = 'keephard.dashboardBeat';
const beat = document.getElementById('beat') as HTMLInputElement;
try {
  void chrome.storage.local.get(KEY).then((o: Record<string, unknown>) => { const v = o?.[KEY]; beat.checked = typeof v === 'boolean' ? v : false; });
  beat.addEventListener('change', () => { void chrome.storage.local.set({ [KEY]: beat.checked }); });
} catch { /* storage unavailable */ }
