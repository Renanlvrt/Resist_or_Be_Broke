<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { kh } from './store';
import { fmtDate, fmtGbp } from './impact';

// Animated: saved-toward-goal runs from before to after the purchase (red), and back up when "Buy it cheaper" is taken.
const shown = ref(kh.impact?.savedBefore ?? 0);
let raf = 0, token = 0;
function tween(to: number, ms: number, delay = 0) {
  const t = ++token; const from = shown.value; const t0 = performance.now() + delay;
  cancelAnimationFrame(raf);
  const step = (now: number) => {
    if (t !== token) return;
    const k = Math.min(1, Math.max(0, (now - t0) / ms));
    shown.value = Math.round((from + (to - from) * (1 - Math.pow(1 - k, 3))) * 100) / 100;
    if (k < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
watch(() => kh.impact, i => { if (i) { shown.value = i.savedBefore; tween(i.savedAfter, 1500, 500); } }, { immediate: true });
watch(() => kh.recovery, r => { if (r) tween(r.savedAfter, 1000); });
onBeforeUnmount(() => cancelAnimationFrame(raf));
const i = computed(() => kh.impact!);
const bad = computed(() => shown.value < i.value.savedBefore - 0.005 && !kh.recovery);
const pct = computed(() => Math.max(0, Math.min(100, (shown.value / i.value.amount) * 100)));
const toFind = computed(() => Math.max(0, i.value.amount - shown.value));
const reachable = computed(() => shown.value >= 0);
</script>

<template>
  <section v-if="kh.impact" class="goal-impact" :class="{ bad }" aria-live="polite" data-goal-impact>
    <h2>{{ i.label }} · by {{ fmtDate(i.by) }}</h2>
    <div class="gi-row"><strong class="gi-num" data-gi-saved>{{ fmtGbp(shown) }}</strong><span>saved of {{ fmtGbp(i.amount) }}</span></div>
    <div class="gi-bar" role="progressbar" :aria-valuenow="Math.round(pct)" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: pct + '%' }"></i></div>
    <p class="gi-line" v-if="kh.recovery">Cheaper pair: {{ fmtGbp(kh.recovery.amount) }} stays in your goal.</p>
    <p class="gi-line" v-else-if="bad">These at {{ fmtGbp(i.price) }} leaves {{ fmtGbp(toFind) }} to find by {{ fmtDate(i.by) }}. That is {{ fmtGbp(i.weeklyAfter) }} a week, was {{ fmtGbp(i.weeklyBefore) }}.</p>
    <p class="gi-flag" v-if="!reachable">Not reachable by {{ fmtDate(i.by) }}</p>
  </section>
</template>

<style>
.goal-impact{margin-top:14px;padding:14px 16px;border-radius:10px;background:#f4f8f2;border:1px solid #dce6d6;transition:background .6s,border-color .6s}
.goal-impact.bad{background:#fdecec;border-color:#f3b8b8}
.goal-impact h2{font-size:14px}.gi-row{display:flex;align-items:baseline;gap:8px;margin-top:6px}
.gi-num{font-size:30px;letter-spacing:-1px;color:#23874c;transition:color .6s}.goal-impact.bad .gi-num{color:#c0392b}
.gi-row span{color:#5d6150;font-size:12px}
.gi-bar{height:8px;border-radius:99px;background:#e3e6dc;margin-top:8px;overflow:hidden}.gi-bar i{display:block;height:100%;background:#23874c;border-radius:99px}.goal-impact.bad .gi-bar i{background:#c0392b}
.gi-line{margin-top:8px;font-size:12px;color:#444}.gi-flag{margin-top:6px;font-weight:700;color:#c0392b;font-size:13px}
</style>
