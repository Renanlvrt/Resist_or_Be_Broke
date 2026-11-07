document.getElementById('b').onclick = async () => {
  const s = document.getElementById('s');
  try {
    (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop());
    s.textContent = 'Microphone allowed.';
  } catch (e) { s.textContent = 'Denied: ' + e.message; }
};
