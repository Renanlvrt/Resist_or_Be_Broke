import { createRoot } from 'react-dom/client';
import { App } from './App';

// Every CSS file in ./styles is inlined into the shadow root, so the shop's CSS can't touch us
// and ours can't touch the shop. Add a new file per component; no shared stylesheet to fight over.
const styles = import.meta.glob('./styles/*.css', { query: '?inline', import: 'default', eager: true }) as Record<
  string,
  string
>;

function mount() {
  if (document.getElementById('rob-root')) return;
  const host = document.createElement('div');
  host.id = 'rob-root';
  host.style.all = 'initial';
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  for (const css of Object.keys(styles).sort().map((k) => styles[k]!)) {
    const el = document.createElement('style');
    el.textContent = css;
    shadow.appendChild(el);
  }
  const container = document.createElement('div');
  container.className = 'rob';
  shadow.appendChild(container);
  createRoot(container).render(<App />);
}

mount();
