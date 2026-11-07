<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { mountTranscript } from './transcript';
import { kh } from './store';
import { fmtGbp } from './impact';
let tr: { destroy(): void } | undefined;
onMounted(() => { tr = mountTranscript(); });
onBeforeUnmount(() => tr?.destroy());
const send = (name: string, detail?: unknown) => window.dispatchEvent(new CustomEvent('keephard:' + name, { detail }));
const buy = () => send('offerchoice', { buy: true });
const no = () => send('offerchoice', { buy: false });
const stay = () => send('stay');
</script>

<template>
  <div class="kh-layer" data-keephard-layer>
    <div v-if="kh.toast" class="kh-toast" role="status">{{ kh.toast }}</div>
    <button v-if="kh.tap && !kh.offer" class="kh-tap" type="button">Right then. Tap anywhere.</button>
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
.kh-layer button,.kh-layer input,.kh-layer .kh-offer{pointer-events:auto}
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
