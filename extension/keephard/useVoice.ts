import { onBeforeUnmount, onMounted, watch } from 'vue';
import type { MascotController } from '../lib/controller';
import { detectProduct } from '../../packages/voice/bridge/src/detect';
import { KEEPHARD_CONFIG } from './config';
import { computeImpact } from './impact';
import { kh, loadSavings, watchSavings } from './store';

/** Is the live voice flow the owner of this page? (shoe product page, bridge alive, kill switch on, flag on.)
 *  Used by App.vue to skip Pocket's older Add-to-Basket popup there. */
export function voiceOwnsPage(doc: Document = document, href: string = location.href): boolean {
  if (!KEEPHARD_CONFIG.voicePrimaryOnShoePages || !kh.bridge || !kh.enabled) return false;
  try { return !!detectProduct(doc, href, { demo: true, fast: true }).product; } catch { return false; }
}

const send = (name: string, detail?: unknown) => window.dispatchEvent(new CustomEvent('keephard:' + name, { detail }));

/** Wires the KeepHard bridge events (window CustomEvents, same isolated world) to Bloub (MascotController)
 *  and to the shared `kh` store rendered by VoiceLayer.vue / Dashboard.vue. */
export function useVoice(controller: MascotController) {
  const scene = controller.scene;
  let motion = false, talkT: ReturnType<typeof setInterval> | undefined, impactT: ReturnType<typeof setTimeout> | undefined;
  let talkFlip = false;

  async function play(type: 'PEEK' | 'SUSPICIOUS' | 'DISAPPROVE' | 'DISMISS' | 'RETURN' | 'OPEN_DASHBOARD') {
    motion = true;
    try { await controller.dispatch({ type }); } finally { motion = false; }
  }
  const face = (id: Parameters<MascotController['expression']>[0]) => { if (!motion && !scene.dashboard) controller.expression(id); };
  function stopTalk() { clearInterval(talkT); talkT = undefined; }
  function setState(state: string) {
    kh.state = state; stopTalk();
    if (state === 'listening') face('attentif');
    else if (state === 'connecting') face('curieux');
    else if (state === 'talking' || state === 'speaking') {
      face('blase'); // deadpan default; understated mouth-flap, no big movement
      talkT = setInterval(() => { talkFlip = !talkFlip; face(talkFlip ? 'attentif' : 'blase'); }, 360);
    } else if (state === 'happy') face('heureux'); // softer, warm face on accept / saving
    else if (state === 'disappointed') void play('SUSPICIOUS'); // raised eyebrow on reject (mefiant), not a shake
  }
  function closeImpact(back = true) {
    clearTimeout(impactT); impactT = undefined;
    const had = !!kh.impact;
    kh.impact = null; kh.recovery = null;
    if (had && back && scene.dashboard) void play('RETURN');
  }
  function finish() {
    stopTalk(); clearTimeout(impactT);
    const wasDash = scene.dashboard && !!kh.impact;
    kh.active = false; kh.offer = null; kh.countdown = 0; kh.caption = ''; kh.userLine = ''; kh.typed = false; kh.tap = false;
    kh.impact = null; kh.recovery = null; kh.state = 'idle';
    if (scene.visible || wasDash) void play('DISMISS');
  }
  function onUi(e: Event) {
    const d = (e as CustomEvent).detail as Record<string, any> | null;
    if (!d || typeof d !== 'object') return;
    switch (d.kind) {
      case 'peek':
        if (d.on) { kh.active = true; if (!scene.visible) void play('PEEK'); } else finish();
        break;
      case 'state': setState(String(d.state)); break;
      case 'caption':
        if (d.who === 'user') kh.userLine = String(d.text); else { kh.caption = String(d.text); kh.userLine = ''; }
        break;
      case 'tap': kh.tap = !!d.on; break;
      case 'typedopen': kh.typed = true; break;
      case 'error': kh.error = String(d.text || ''); break;
      case 'toast': kh.toast = String(d.text || ''); setTimeout(() => { kh.toast = ''; }, 2200); break;
      case 'offer': {
        const r = d.result, a = r?.alternative;
        if (!a) break;
        kh.caption = ''; kh.userLine = ''; kh.countdown = 0;
        kh.offer = { title: String(a.title), retailer: String(a.retailer), colour: a.colour || a.color || undefined, price: Number(a.price), savings: Number(r.savings) };
        break;
      }
      case 'countdown': kh.countdown = Number(d.left) || 0; break;
      case 'hideoffer': kh.offer = null; kh.countdown = 0; break;
      case 'impact': {
        kh.impact = computeImpact(d.goal, Number(d.price) || 0); kh.recovery = null;
        clearTimeout(impactT); impactT = setTimeout(() => closeImpact(true), KEEPHARD_CONFIG.impactDashboardMs);
        void play('OPEN_DASHBOARD');
        break;
      }
      case 'recovered':
        if (kh.impact) kh.recovery = { amount: Number(d.amount) || 0, savedAfter: Math.round((kh.impact.savedAfter + (Number(d.amount) || 0)) * 100) / 100 };
        break;
    }
  }
  const onDetected = () => { kh.active = true; kh.bridge = true; if (!scene.visible) void play('PEEK'); };
  const onSettings = (e: Event) => {
    const d = (e as CustomEvent).detail;
    if (!d || typeof d !== 'object') return;
    kh.bridge = true; kh.enabled = d.enabled !== false;
    if (!kh.enabled) finish();
  };
  const onEnd = () => finish();
  const onOfferGone = () => { closeImpact(false); finish(); };

  watch(() => scene.dashboard, open => { if (!open && kh.impact) { clearTimeout(impactT); kh.impact = null; kh.recovery = null; } });
  // User dismissed Bloub (Escape / close) while the voice session is live: stop the mic and session too.
  watch(() => scene.visible, v => { if (!v && kh.active && !motion) { send('stop'); kh.active = false; kh.offer = null; kh.caption = ''; kh.userLine = ''; } });

  let unwatch: (() => void) | undefined;
  onMounted(() => {
    window.addEventListener('keephard:ui', onUi);
    window.addEventListener('keephard:detected', onDetected);
    window.addEventListener('keephard:settings', onSettings);
    window.addEventListener('keephard:idle', onEnd);
    window.addEventListener('keephard:offerdismissed', onOfferGone);
    window.addEventListener('keephard:redirect', onEnd);
    void loadSavings(); unwatch = watchSavings();
    send('uiready'); // handshake: bridge holds auto-start until the UI is mounted
  });
  onBeforeUnmount(() => {
    window.removeEventListener('keephard:ui', onUi);
    window.removeEventListener('keephard:detected', onDetected);
    window.removeEventListener('keephard:settings', onSettings);
    window.removeEventListener('keephard:idle', onEnd);
    window.removeEventListener('keephard:offerdismissed', onOfferGone);
    window.removeEventListener('keephard:redirect', onEnd);
    unwatch?.(); stopTalk(); clearTimeout(impactT);
  });
  return { kh, voiceOwnsPage: () => voiceOwnsPage(), active: () => kh.active };
}
