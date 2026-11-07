import { watchEffect } from 'vue';
import { kh } from './store';

const send = (name: string, detail?: unknown) => window.dispatchEvent(new CustomEvent('keephard:' + name, { detail }));
const CSS = `
:host{all:initial}
*{box-sizing:border-box;font-family:system-ui,sans-serif}
.card{position:fixed;right:24px;bottom:236px;width:300px;max-height:240px;background:#fff;color:#111;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.35);padding:10px 26px 10px 12px;font-size:13px;line-height:1.4;display:none;flex-direction:column;gap:6px;opacity:1;transition:opacity .9s ease}
.card.open{display:flex}.card.fade{opacity:0}
.x{position:absolute;top:2px;right:6px;border:0;background:none;color:#888;font-size:18px;padding:2px 4px;cursor:pointer}
.log{display:flex;flex-direction:column;gap:3px;overflow:hidden;justify-content:flex-end}
.a{color:#7a1f1f}.u{color:#0a58ca}.err{color:#9b1c1c;font-size:12px}
.typed{display:none;gap:4px}.typed.open{display:flex}
input{flex:1;min-width:0;padding:5px 7px;font-size:12px;border:1px solid #999;border-radius:6px}
.typed button{padding:4px 10px;font-size:12px;border:0;border-radius:6px;background:#f0b429;font-weight:600;cursor:pointer}
`;

/** Compact transcript card (shadow DOM) for voice conversations: "KeepHard: ..." in dark red, "You: ..." in blue,
 *  newest at the bottom, older lines fade. Typed input only on fallback. Driven by the shared `kh` store. */
export function mountTranscript(): { destroy(): void } {
  const host = document.createElement('div');
  host.setAttribute('data-keephard-transcript', '');
  host.style.cssText = 'position:fixed;z-index:2147483604;pointer-events:none;inset:auto';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${CSS}</style><section class="card" aria-live="polite"><button class="x" type="button" aria-label="Close">&times;</button><div class="log"></div><div class="err"></div><form class="typed"><input placeholder="Type your reason..."><button type="submit">Send</button></form></section>`;
  const q = <T extends Element>(s: string) => root.querySelector(s) as T;
  const card = q<HTMLElement>('.card'), log = q<HTMLElement>('.log'), err = q<HTMLElement>('.err'), typedEl = q<HTMLFormElement>('.typed'), input = q<HTMLInputElement>('input');
  card.style.pointerEvents = 'auto';
  q('.x').addEventListener('click', () => { send('stop'); kh.transcript.splice(0); kh.lingering = false; });
  for (const ev of ['keydown', 'keyup', 'keypress']) input.addEventListener(ev, (e) => e.stopPropagation());
  typedEl.addEventListener('submit', (e) => { e.preventDefault(); const t = input.value.trim(); if (t) { input.value = ''; send('typed', { text: t }); } });
  (document.body || document.documentElement).appendChild(host);

  const stopFx = watchEffect(() => {
    const lines = kh.transcript.slice(-5);
    const visible = (kh.active || kh.lingering) && !kh.offer && (lines.length > 0 || kh.typed || !!kh.error);
    card.classList.toggle('open', visible);
    card.classList.toggle('fade', kh.lingering && kh.fading);
    log.textContent = '';
    lines.forEach((l, i) => {
      const d = document.createElement('div');
      d.className = l.who === 'user' ? 'u' : 'a';
      d.textContent = (l.who === 'user' ? 'You: ' : 'KeepHard: ') + l.text;
      const rank = lines.length - 1 - i; // 0 = newest
      d.style.opacity = String(Math.max(0.35, 1 - rank * 0.22));
      log.appendChild(d);
    });
    err.textContent = kh.error; err.style.display = kh.error ? 'block' : 'none';
    typedEl.classList.toggle('open', kh.typed);
  });
  return { destroy() { stopFx(); host.remove(); } };
}
