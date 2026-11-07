import { onBeforeUnmount, onMounted, watch } from 'vue';
import type { MascotController } from '../lib/controller';
import { detectProduct } from '../../packages/voice/bridge/src/detect';
import { KEEPHARD_CONFIG } from './config';
import { computeImpact } from './impact';
import { kh, loadSavings, watchSavings } from './store';

/** Is the live voice flow the owner of this page? (shoe product page, bridge alive, kill switch on, flag on.)
 *  Used by App.vue to skip Pocket's older Add-to-Basket popup there. */
/** Voice flow is armed on this page but no verdict yet: Pocket's corner hover must not open the dashboard. */
export function voicePending(): boolean { return kh.bridge && kh.enabled && !kh.verdictSeen && voiceOwnsPage(); }
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
    else if (state === 'disappointed') { if (scene.dashboard) face('mefiant'); else void play('SUSPICIOUS'); } // raised eyebrow on reject; never a motion that would close the open dashboard
  }
  function closeImpact(back = true) {
    clearTimeout(impactT); impactT = undefined;
    const had = !!kh.impact;
    kh.impact = null; kh.recovery = null; kh.bigLine = '';
    if (had && back && scene.dashboard) void play('RETURN');
  }
  let trId = 0, fadeT: ReturnType<typeof setTimeout> | undefined, clearT: ReturnType<typeof setTimeout> | undefined;
  function addLine(who: 'avatar' | 'user', text: string) {
    text = text.trim(); if (!text) return;
    clearTimeout(fadeT); clearTimeout(clearT); kh.lingering = false; kh.fading = false;
    const last = kh.transcript[kh.transcript.length - 1];
    if (last && last.who === who && last.text === text) return;
    kh.transcript.push({ id: ++trId, who, text });
    if (kh.transcript.length > 8) kh.transcript.splice(0, kh.transcript.length - 8);
  }
  function endTranscript() { // keep the transcript ~4s after the session ends, fading in the last second
    if (!kh.transcript.length) return;
    kh.lingering = true; kh.fading = false;
    clearTimeout(fadeT); clearTimeout(clearT);
    fadeT = setTimeout(() => { kh.fading = true; }, 3000);
    clearT = setTimeout(() => { kh.transcript.splice(0); kh.lingering = false; kh.fading = false; }, 4000);
  }
  function finish() {
    endTranscript();
    stopTalk(); clearTimeout(impactT);
    const wasDash = scene.dashboard && !!kh.impact;
    kh.active = false; kh.offer = null; kh.countdown = 0; kh.caption = ''; kh.userLine = ''; kh.typed = false; kh.tap = false;
    kh.impact = null; kh.recovery = null; kh.bigLine = ''; kh.state = 'idle';
    if (scene.visible || wasDash) void play('DISMISS');
  }
  function onUi(e: Event) {
    const d = (e as CustomEvent).detail as Record<string, any> | null;
    if (!d || typeof d !== 'object') return;
    switch (d.kind) {
      case 'peek':
        if (d.on) { if (!kh.active) { kh.verdictSeen = false; kh.bigLine = ''; kh.transcript.splice(0); kh.lingering = false; kh.fading = false; } kh.active = true; if (!scene.visible) void play('PEEK'); } else finish();
        break;
      case 'state': setState(String(d.state)); break;
      case 'caption':
        if (d.who === 'user') kh.userLine = String(d.text); else { kh.caption = String(d.text); kh.userLine = ''; }
        addLine(d.who === 'user' ? 'user' : 'avatar', String(d.text));
        break;
      case 'tap': kh.tap = !!d.on; break;
      case 'typedopen': kh.typed = true; break;
      case 'error': { const t = String(d.text || ''); kh.error = /mic/i.test(t) ? t : ''; break; } // never show raw network/proxy errors
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
        if (!kh.verdictSeen) break; // never before a verdict
        if (!(Number(d.price) > 0) || !d.goal) break; // nothing to show: do not open an empty panel
        kh.impactTone = d.tone === 'caution' ? 'caution' : 'reject';
        kh.impact = computeImpact(d.goal, Number(d.price) || 0); kh.recovery = null;
        clearTimeout(impactT); impactT = setTimeout(() => closeImpact(true), KEEPHARD_CONFIG.impactDashboardMs);
        if (!scene.dashboard) void play('OPEN_DASHBOARD');
        break;
      }
      case 'bigline':
        kh.bigLine = String(d.text || '');
        if (kh.impact) { clearTimeout(impactT); impactT = setTimeout(() => closeImpact(true), 9000); } // keep the dashboard up while it is said
        break;
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
  const onVerdict = () => { kh.verdictSeen = true; };
  const onOfferGone = () => { closeImpact(false); finish(); };

  watch(() => scene.dashboard, open => { if (!open && kh.impact) { clearTimeout(impactT); kh.impact = null; kh.recovery = null; } });
  // User dismissed Bloub (Escape / close) while the voice session is live: stop the mic and session too.
  watch(() => scene.visible, v => { if (!v && kh.active && !motion) { send('stop'); endTranscript(); kh.active = false; kh.offer = null; kh.caption = ''; kh.userLine = ''; } });

  let unwatch: (() => void) | undefined;
  onMounted(() => {
    window.addEventListener('keephard:ui', onUi);
    window.addEventListener('keephard:detected', onDetected);
    window.addEventListener('keephard:settings', onSettings);
    window.addEventListener('keephard:idle', onEnd);
    window.addEventListener('keephard:verdict', onVerdict);
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
    window.removeEventListener('keephard:verdict', onVerdict);
    window.removeEventListener('keephard:offerdismissed', onOfferGone);
    window.removeEventListener('keephard:redirect', onEnd);
    unwatch?.(); stopTalk(); clearTimeout(impactT); clearTimeout(fadeT); clearTimeout(clearT);
  });
  return { kh, voiceOwnsPage: () => voiceOwnsPage(), active: () => kh.active || voicePending() };
}
