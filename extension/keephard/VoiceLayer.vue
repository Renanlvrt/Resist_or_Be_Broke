<script setup lang="ts">
import { ref } from 'vue';
import { kh } from './store';
import { fmtGbp } from './impact';
const typed = ref('');
const send = (name: string, detail?: unknown) => window.dispatchEvent(new CustomEvent('keephard:' + name, { detail }));
function submit() { const text = typed.value.trim(); if (!text) return; typed.value = ''; kh.userLine = text; send('typed', { text }); }
function close() { send('stop'); }
const buy = () => send('offerchoice', { buy: true });
const no = () => send('offerchoice', { buy: false });
const stay = () => send('stay');
const stop = (e: Event) => e.stopPropagation();
</script>

<template>
  <div class="kh-layer" data-keephard-layer>
    <div v-if="kh.toast" class="kh-toast" role="status">{{ kh.toast }}</div>
    <button v-if="kh.tap && !kh.offer" class="kh-tap" type="button">Right then. Tap anywhere.</button>
    <section v-if="kh.active && !kh.offer && (kh.caption || kh.userLine || kh.typed || kh.error)" class="kh-bubble" aria-live="polite" data-keephard-caption>
      <button class="kh-x" type="button" aria-label="Close Bloub" @click="close">×</button>
      <p v-if="kh.caption" class="kh-line">{{ kh.caption }}</p>
      <p v-if="kh.userLine" class="kh-me">You: {{ kh.userLine }}</p>
      <p v-if="kh.error" class="kh-err">{{ kh.error }}</p>
      <form v-if="kh.typed" class="kh-typed" @submit.prevent="submit">
        <input v-model="typed" placeholder="Go on, type it." @keydown="stop" @keyup="stop" @keypress="stop">
        <button type="submit">Send</button>
      </form>
    </section>
    <section v-if="kh.offer" class="kh-offer modal-surface" role="region" aria-label="A cheaper pair" data-keephard-offer>
      <div class="kh-title">{{ kh.offer.title }}</div>
      <div class="kh-retail">{{ kh.offer.retailer }}<template v-if="kh.offer.colour"> · {{ kh.offer.colour }}</template></div>
      <div class="kh-price">{{ fmtGbp(kh.offer.price) }}</div>
      <div class="kh-badge">Save {{ fmtGbp(kh.offer.savings) }}</div>
      <div v-if="kh.countdown > 0" class="kh-count"><span>Taking you there in {{ kh.countdown }}…</span><button type="button" @click="stay">Stay here</button></div>
      <div v-else class="kh-btns"><button class="kh-buy primary-button" type="button" @click="buy">Buy it cheaper</button><button class="kh-no" type="button" @click="no">No thanks</button></div>
    </section>
  </div>
</template>

<style>
.kh-layer{position:fixed;inset:0;pointer-events:none;z-index:2147483603}
.kh-layer button,.kh-layer input,.kh-layer .kh-bubble,.kh-layer .kh-offer{pointer-events:auto}
.kh-bubble{position:fixed;right:24px;bottom:236px;max-width:300px;background:#fff;color:#24271f;border-radius:16px 16px 4px 16px;box-shadow:0 10px 40px #151a2338;padding:12px 30px 12px 14px;font-size:14px;line-height:1.4;animation:kh-pop .3s cubic-bezier(.34,1.56,.64,1)}
.kh-x{position:absolute;top:2px;right:6px;border:0;background:none;color:#888b7c;font-size:18px;padding:2px 4px}
.kh-line{font-weight:600}.kh-me{margin-top:4px;color:#5d6150;font-size:12px}.kh-err{margin-top:4px;color:#9b1c1c;font-size:12px}
.kh-typed{display:flex;gap:6px;margin-top:8px}.kh-typed input{flex:1;min-width:0;padding:6px 8px;border:1px solid #dedfd5;border-radius:8px}
.kh-typed button{border:0;background:#f0b429;border-radius:8px;padding:6px 10px;font-weight:600}
.kh-offer{position:fixed;right:24px;bottom:236px;width:300px;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:4px;border-top:4px solid #f0b429;animation:kh-pop .3s cubic-bezier(.34,1.56,.64,1)}
.kh-title{font-weight:700;font-size:14px;line-height:1.3}.kh-retail{color:#5d6150;font-size:12px}.kh-price{font-size:24px;font-weight:800}
.kh-badge{align-self:flex-start;background:#23874c;color:#fff;border-radius:999px;padding:3px 10px;font-weight:700;font-size:12px}
.kh-btns{display:flex;gap:8px;margin-top:8px}.kh-buy{flex:1;background:#f0b429;border:0;border-radius:8px;padding:10px;font-weight:800}
.kh-no{background:#fff;border:1px solid #bbb;border-radius:8px;padding:10px;color:#444}
.kh-count{display:flex;align-items:center;gap:8px;margin-top:8px;font-weight:700;color:#23874c}.kh-count span{flex:1}.kh-count button{background:#fff;border:1px solid #bbb;border-radius:8px;padding:6px 10px;color:#444}
.kh-tap{position:fixed;right:24px;bottom:236px;background:#f0b429;border:0;border-radius:999px;padding:12px 20px;font-size:16px;font-weight:800;box-shadow:0 0 0 0 #f0b42999;animation:kh-ring 1.5s infinite}
.kh-toast{position:fixed;left:50%;top:16px;transform:translateX(-50%);background:#111;color:#f0b429;border-radius:999px;padding:6px 14px;font-weight:600;font-size:12px}
@keyframes kh-pop{0%{transform:scale(.4);opacity:0}100%{transform:scale(1);opacity:1}}
@keyframes kh-ring{100%{box-shadow:0 0 0 24px #f0b42900}}
</style>
