<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { kh } from './store';
import { fmtDate, fmtGbp } from './impact';
import { HOLIDAY, holidayAfter, holidayBaseline, holidayOnTrack } from '../lib/holiday';

// Summer holiday goal card. Always visible: green "skip" state when the dashboard is opened by hand.
// When the voice flow reports a product price (kh.impact) the June projection animates down (red, "buy"),
// and back up when "Buy it cheaper" is taken (kh.recovery).
const props = defineProps<{ saved: number }>();
const before = computed(() => holidayBaseline(props.saved));
const price = computed(() => kh.impact?.price ?? 0);
const buying = computed(() => !!kh.impact);
const target = computed(() => {
  if (!kh.impact) return before.value;
  if (kh.recovery) return holidayAfter(props.saved, Math.max(0, kh.impact.savedBefore - kh.recovery.savedAfter));
  return holidayAfter(props.saved, kh.impact.price);
});
const shown = ref(before.value);
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
watch(() => kh.impact, i => { if (i) { shown.value = before.value; tween(target.value, 1500, 500); } else { token++; shown.value = before.value; } }, { immediate: true });
watch(() => kh.recovery, r => { if (r) tween(target.value, 1000); });
onBeforeUnmount(() => cancelAnimationFrame(raf));
const ok = computed(() => holidayOnTrack(shown.value));
const final = computed(() => holidayOnTrack(target.value));
const pct = computed(() => Math.max(0, Math.min(100, (shown.value / HOLIDAY.amount) * 100)));
const showBuy = computed(() => buying.value && !kh.recovery);
</script>

<template>
  <section class="goal-impact" :class="{ bad: !ok, caution: kh.impactTone === 'caution' && buying }" aria-live="polite" data-goal-impact>
    <p v-if="kh.impact && kh.impactTone === 'caution' && !kh.recovery" class="gi-head" data-gi-head>Allowed this once. Here is what it does to your goal.</p>
    <div class="gi-top"><h2>{{ HOLIDAY.label }} · {{ fmtGbp(HOLIDAY.amount) }} by {{ fmtDate(HOLIDAY.by) }} 2027</h2>
      <span class="gi-chip" :class="{ bad: !ok }" data-gi-chip>{{ ok ? 'On track: you can go this summer' : 'Off track: not this summer' }}</span></div>
    <div class="gi-row"><strong class="gi-num" data-gi-saved>{{ fmtGbp(shown) }}</strong><span>projected by June</span></div>
    <div class="gi-bar" role="progressbar" :aria-valuenow="Math.round(pct)" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: pct + '%' }"></i></div>
    <p class="gi-line" v-if="kh.recovery">Cheaper pair: {{ fmtGbp(kh.recovery.amount) }} stays in your goal.</p>
    <p class="gi-line" v-else-if="buying">If you buy these ({{ fmtGbp(price) }}): <b class="neg">{{ fmtGbp(target) }}</b> by June · If you skip them: <b class="pos">{{ fmtGbp(before) }}</b> by June</p>
    <p class="gi-line" v-else>If you skip purchases like these: <b class="pos">{{ fmtGbp(before) }}</b> by June, {{ fmtGbp(before - HOLIDAY.amount) }} above target.</p>
    <p class="gi-flag good" v-if="ok && !buying || ok && final" data-gi-congrats>You can go on holiday this summer</p>
    <p class="gi-flag" v-else-if="showBuy && !ok">This pushes the holiday past June.</p>
  </section>
</template>

<style>
.goal-impact{margin:0;padding:clamp(7px,1.3vh,12px) 14px;border-radius:10px;background:#f4f8f2;border:1px solid #dce6d6;transition:background .6s,border-color .6s}
.goal-impact.bad{background:#fdecec;border-color:#f3b8b8}
.goal-impact h2{font-size:12px;font-weight:500;color:#41473f}
.gi-top{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px 10px}
.gi-chip{font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:99px;background:#dff0e4;color:#1c6b3b;transition:background .6s,color .6s}.gi-chip.bad{background:#f7d4d4;color:#a32f23}
.gi-row{display:flex;align-items:baseline;gap:8px;margin-top:2px}
.gi-num{font-size:clamp(18px,3.2vh,26px);letter-spacing:-.5px;color:#23874c;transition:color .6s}.goal-impact.bad .gi-num{color:#c0392b}
.gi-row span{color:#5d6150;font-size:11px}
.gi-bar{height:4px;border-radius:99px;background:#e3e6dc;margin-top:5px;overflow:hidden}.gi-bar i{display:block;height:100%;background:#23874c;border-radius:99px;transition:background .6s}.goal-impact.bad .gi-bar i{background:#c0392b}
.goal-impact.caution.bad{background:#fff6e0;border-color:#f0c96a}.goal-impact.caution.bad .gi-num{color:#b7791f}.goal-impact.caution.bad .gi-bar i{background:#e0a020}.goal-impact.caution .gi-flag{color:#b7791f}
.gi-head{font-weight:700;font-size:11.5px;margin-bottom:3px;color:#7a5a12}
.gi-line{margin-top:5px;font-size:11px;color:#444;line-height:1.35}.gi-line .neg{color:#c0392b}.gi-line .pos{color:#23874c}
.gi-flag{margin-top:3px;font-weight:700;color:#c0392b;font-size:11.5px}.gi-flag.good{color:#1c6b3b;animation:gi-in .6s ease both}
@keyframes gi-in{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
</style>
