/**
 * Speaks a line. For now uses the browser's built-in voice; step 3 swaps in ElevenLabs
 * audio from /api/tts with this as the fallback. Captions are always shown on screen.
 */
export function speak(text: string): void {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    u.rate = 1.02;
    window.speechSynthesis.speak(u);
  } catch {
    /* voice is optional */
  }
}

export function stopSpeaking(): void {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}
