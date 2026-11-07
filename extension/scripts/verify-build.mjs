import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { Window } from 'happy-dom';
const root = path.resolve('.output/chrome-mv3');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ['storage']);
const script = manifest.content_scripts[0];
assert.deepEqual([...script.matches].sort(), ['http://*/*', 'https://*/*']);
assert(manifest.action.default_popup);
for (const file of [...script.js, ...Object.values(manifest.icons), manifest.action.default_popup, 'BLOUB-LICENSE.txt']) await access(path.join(root, file));
const source = await readFile(path.join(root, script.js[0]), 'utf8');
const css = await readFile(path.join(root, 'content-scripts/content.css'), 'utf8');
assert(!/eval\(|new Function\(/.test(source));
assert(css.includes('clip-path:polygon('));
console.log('PASS MV3 package, Amazon UK + localhost only, local popup, license and bundled styles');
const wait = async (predicate, label, timeout = 16000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error(`Timeout: ${label}`);
};
const button = (shadow, text) => [...shadow.querySelectorAll('button')].find(node => node.textContent.trim() === text);
function host(url) {
  const window = new Window({ url, settings: { enableJavaScriptEvaluation: true } });
  const store = {}, messages = new Set(), changes = new Set();
  let audioContexts = 0;
  window.AudioContext = class { constructor() { audioContexts++; throw new Error('Synthetic events must not unlock audio'); } };
  window.chrome = {
    runtime: { id: 'pocket-production-test', getURL: value => `chrome-extension://pocket-production-test/${value.replace(/^\//, '')}`,
      onMessage: { addListener: value => messages.add(value), removeListener: value => messages.delete(value) } },
    storage: {
      onChanged: { addListener: value => changes.add(value), removeListener: value => changes.delete(value) },
      local: {
        get: async key => ({ [key]: store[key] }),
        set: async value => {
          Object.assign(store, JSON.parse(JSON.stringify(value)));
          queueMicrotask(() => { for (const listener of changes) listener(Object.fromEntries(Object.entries(value).map(([key, newValue]) => [key, { newValue }])), 'local'); });
        },
      },
    },
  };
  window.fetch = async () => new window.Response(css, { status: 200 });
  window.HTMLElement.prototype.animate = function () {
    let reject, timer;
    const finished = new Promise((resolve, fail) => { reject = fail; timer = setTimeout(resolve, 10); });
    return { finished, cancel() { clearTimeout(timer); reject(new Error('cancelled')); } };
  };
  return { window, store, messages, changes, get saved() { return store['pocket-v1']; }, get audioContexts() { return audioContexts; } };
}
const local = host('http://localhost:5173/');
const { window } = local;
window.document.body.innerHTML = '<main><button id="native">Host page control</button></main>';
try {
  await window.eval(source);
  await wait(() => window.document.documentElement.dataset.pocketExtension === 'ready', 'ready');
  let shadow = window.document.querySelector('pocket-companion').shadowRoot;
  assert(shadow); assert(!shadow.querySelector('.dev-panel,.corner-tab,.dev-launch'));
  assert.equal(shadow.querySelector('.corner-hotspot').textContent, '');
  assert.equal(window.getComputedStyle(shadow.querySelector('.corner-hotspot')).pointerEvents, 'none');
  assert.equal(local.audioContexts, 0);
  console.log('PASS Production injection is styled, launcher is invisible and developer lab hidden');
  const move = (x, y) => window.dispatchEvent(new window.PointerEvent('pointermove', { clientX: x, clientY: y, pointerType: 'mouse' }));
  move(window.innerWidth - 10, window.innerHeight - 10);
  await new Promise(resolve => setTimeout(resolve, 100)); move(100, 100);
  await new Promise(resolve => setTimeout(resolve, 1400)); assert(!shadow.querySelector('[data-dashboard]'));
  move(window.innerWidth - 10, window.innerHeight - 10);
  await wait(() => shadow.querySelector('[data-dashboard]'), 'intentional corner hover');
  assert.equal(shadow.querySelector('[data-saved-amount]').textContent, '£131');
  assert.equal(shadow.querySelectorAll('.recap-goals li').length, 4);
  assert.equal(shadow.querySelectorAll('.receipt-section dl>div').length, 6);
  assert(!shadow.querySelector('[data-dashboard] svg,[data-dashboard] progress,[data-dashboard] .card'));
  assert.equal(shadow.querySelector('[data-body]').getAttribute('fill').toLowerCase(), '#f0b429');
  assert(!shadow.querySelector('[data-body]').hasAttribute('stroke'));
  assert.equal(shadow.querySelector('[data-eye-backing]').getAttribute('fill'), '#FFFFFF');
  shadow.querySelector('[aria-label="Close dashboard"]').click(); await wait(() => !shadow.querySelector('[data-dashboard]'), 'close recap');
  console.log('PASS Brief hover cancels; deliberate dwell opens exact minimal £131 torn-receipt recap');
  const event = detail => window.dispatchEvent(new window.CustomEvent('pocket:shop', { detail }));
  event({ type: 'PURCHASE', item: { title: 'Notebook', price: 4, category: 'stationery' } });
  await wait(() => local.saved?.responses.length === 1, 'green'); assert.equal(local.saved.profile.balance, 1236);
  event({ type: 'PURCHASE', item: { title: 'Trainers', price: 60, category: 'clothing' } });
  await wait(() => shadow.querySelector('[data-intervention].amber'), 'amber'); assert(button(shadow, 'Continue to checkout →'));
  button(shadow, 'Save it instead ↗').click(); await wait(() => local.saved.profile.goal.saved === 540, 'save');
  assert.equal(local.saved.profile.balance, 1176);
  event({ type: 'PURCHASE', item: { title: 'Wine', price: 28, category: 'alcohol' } });
  await wait(() => shadow.querySelector('[data-intervention].red'), 'red');
  assert(shadow.querySelector('.backdrop')); assert(shadow.textContent.includes('No alcohol this month.'));
  button(shadow, 'Continue to checkout →').click(); await wait(() => local.saved.responses.length === 3, 'continue');
  assert.equal(local.saved.profile.balance, 1148);
  event({ type: 'PURCHASE', item: { title: 'Wine again', price: 28, category: 'alcohol' } });
  await wait(() => shadow.querySelector('[data-intervention]'), 'reminder');
  button(shadow, 'Remind me in 24 hours').click(); await wait(() => local.saved.reminders.length === 1, 'reminder record');
  console.log('PASS Green/amber/red sequences, rapid save-to-next-purchase, Continue, Save and local reminders');
  for (const listener of local.messages) await listener({ type: 'POCKET_OPEN_LAB' });
  await wait(() => shadow.querySelector('.dev-panel'), 'popup lab message');
  const checkbox = text => [...shadow.querySelectorAll('.dev-panel label')].find(node => node.textContent.includes(text)).querySelector('input');
  checkbox('Mute sounds').click(); await wait(() => local.store['pocket-sound-muted'] === true, 'persist sound mute');
  assert.equal(local.audioContexts, 0); button(shadow, 'Test sound').click(); assert.equal(local.audioContexts, 0);
  checkbox('Simulate thinking').click(); checkbox('Failed AI response').click(); button(shadow, '£60 trainers').click();
  await wait(() => shadow.querySelector('[data-intervention]')?.textContent.includes('mock response failed'), 'failure fallback');
  button(shadow, 'Continue to checkout →').click(); await wait(() => local.saved.responses.length === 5, 'failure continue');
  console.log('PASS Popup lab entry, persisted mute, no synthetic-event audio unlock and failure autonomy');
  button(shadow, 'Start / restart check-in').click(); await wait(() => shadow.querySelector('.onboarding'), 'onboarding');
  for (let i = 0; i < 7; i++) { shadow.querySelector('.onboarding .primary-button').click(); await new Promise(resolve => setTimeout(resolve, 20)); }
  shadow.querySelector('.onboarding .primary-button').click(); await wait(() => local.saved.onboarded, 'profile confirmed');
  await window.eval(source);
  await wait(() => window.document.documentElement.dataset.pocketExtension === 'ready', 'reinject ready');
  assert.equal(window.document.querySelectorAll('pocket-companion').length, 1);
  assert.equal(local.messages.size, 1); assert.equal(local.changes.size, 1);
  shadow = window.document.querySelector('pocket-companion').shadowRoot;
  assert(!shadow.querySelector('.dev-panel'));
  for (const listener of local.messages) await listener({ type: 'POCKET_OPEN_LAB' });
  await wait(() => shadow.querySelector('.dev-panel'), 'reopen lab');
  assert([...shadow.querySelectorAll('.dev-panel label')].find(node => node.textContent.includes('Mute sounds')).querySelector('input').checked);
  button(shadow, 'Reset mock data').click(); await wait(() => local.saved.responses.length === 0, 'reset');
  button(shadow, '▶ Play full demo').click();
  await wait(() => local.saved.responses.length === 3 && shadow.querySelector('[data-dashboard]'), 'full demo', 24000);
  assert.equal(local.saved.profile.balance, 1176); assert.equal(local.saved.profile.goal.saved, 540);
  assert.equal(shadow.querySelector('[data-saved-amount]').textContent, '£131');
  await wait(() => button(shadow, '▶ Play full demo'), 'full demo animation finished');
  button(shadow, '▶ Play full demo').click(); await new Promise(resolve => setTimeout(resolve, 40));
  button(shadow, 'Stop demo').click(); await new Promise(resolve => setTimeout(resolve, 3500));
  assert(!shadow.querySelector('[data-intervention],[data-dashboard]'));
  assert.equal(local.audioContexts, 0);
  console.log('PASS Onboarding, reinjection/listener cleanup, full demo, hardcoded recap and demo cancellation');
} finally { await window.happyDOM.abort(); window.close(); }

// This is a synthetic Amazon DOM fixture, explicitly not a live Amazon test.
const amazon = host('https://www.amazon.co.uk/dp/B000TEST01');
try {
  const w = amazon.window;
  w.document.body.innerHTML = '<h1 id="productTitle">Wireless headphones</h1><input id="ASIN" value="B000TEST01"><div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">£89.99</span></span></div><input id="add-to-cart-button" type="submit"><button id="placeYourOrder">Place order</button>';
  await w.eval(source); await wait(() => w.document.querySelector('pocket-companion')?.shadowRoot?.querySelector('.corner-hotspot'), 'Amazon fixture injects');
  const shadow = w.document.querySelector('pocket-companion').shadowRoot;
  const nativeButton = w.document.querySelector('#add-to-cart-button'); let nativeClicks = 0;
  nativeButton.addEventListener('click', () => nativeClicks++);
  const click = () => { const event = new w.MouseEvent('click', { bubbles: true, cancelable: true }); Object.defineProperty(event, 'isTrusted', { value: true }); nativeButton.dispatchEvent(event); return event; };
  assert.equal(click().defaultPrevented, true); assert.equal(nativeClicks, 0);
  await wait(() => shadow.querySelector('[data-intervention]'), 'Amazon fixture reflection');
  assert(shadow.textContent.includes('This Amazon click is paused'));
  button(shadow, 'Continue to checkout →').click();
  await wait(() => shadow.textContent.includes('Click Amazon’s Add to Basket again'), 'manual second click feedback');
  assert.equal(nativeClicks, 0); assert.equal(click().defaultPrevented, false); assert.equal(nativeClicks, 1);
  const final = new w.MouseEvent('click', { bubbles: true, cancelable: true }); Object.defineProperty(final, 'isTrusted', { value: true });
  w.document.querySelector('#placeYourOrder').dispatchEvent(final); assert.equal(final.defaultPrevented, false);
  console.log('PASS Built Amazon adapter on DOM fixture: pause, reflection, manual-only Continue, final order untouched');
} finally { await amazon.window.happyDOM.abort(); amazon.window.close(); }
console.log('Production package checks passed. Live Amazon and Chrome visual rendering remain unverified.');
