const status = document.getElementById('s')!;
document.getElementById('b')!.addEventListener('click', async () => {
  try {
    (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach(t => t.stop());
    status.textContent = 'Microphone allowed.';
  } catch (e) { status.textContent = 'Denied: ' + (e instanceof Error ? e.message : String(e)); }
});
