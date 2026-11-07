<script setup lang="ts">
// This recap is intentionally a fixed visual demo, independent of mock finance state.
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { kh } from '../keephard/store'; // KEEPHARD
import GoalImpact from '../keephard/GoalImpact.vue'; // KEEPHARD
import AddGoalButton from '../keephard/AddGoalButton.vue'; // KEEPHARD
import { goalsState, goalDot, loadGoals, watchGoals } from '../keephard/goalsStore'; // KEEPHARD
let unwatchGoals: (() => void) | undefined; // KEEPHARD
onMounted(() => { void loadGoals(); unwatchGoals = watchGoals(); }); // KEEPHARD
onBeforeUnmount(() => unwatchGoals?.()); // KEEPHARD
const shownGoals = computed(() => goalsState.goals.slice(-3)); // KEEPHARD
const emit = defineEmits<{ close: [] }>();
// KEEPHARD: savings recorded by the voice flow (storage keephard.savings) on top of the fixed demo £131.
const base = computed(() => Math.round((131 + kh.extra) * 100) / 100);
const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(2);
const aprilTotal = computed(() => Math.round(base.value * Math.pow(1.35, 5)));
// Fixed illustrative growth: £131 compounded at 35% per month through April.
const projectionMonths = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];
const projectionPoint = (month: number) => ({
  x: 12 + month / 5 * 336,
  y: 80 - (Math.pow(1.35, month) - 1) / (Math.pow(1.35, 5) - 1) * 64,
});
const projectionPath = Array.from({ length: 61 }, (_, index) => {
  const point = projectionPoint(index / 12);
  return `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
}).join(' ');
const avoided = [
  { title: 'Headphones', amount: 65 },
  { title: 'Gym bag', amount: 28 },
  { title: 'Coffee maker', amount: 38 },
];
const bought = [
  { title: 'Phone case', amount: 12 },
];
</script>

<template>
  <section class="dashboard monthly-recap" role="dialog" aria-modal="true" aria-labelledby="recap-month" data-dashboard>
    <header class="recap-header">
      <h1 id="recap-month">November</h1>
      <button class="recap-close" aria-label="Close dashboard" @click="emit('close')">×</button>
    </header>
    <div class="recap-layout">
      <div class="recap-left">
        <div class="recap-savings"><strong data-saved-amount>£{{ fmt(base) }}</strong><span>Saved this month</span></div>
        <section class="savings-projection" aria-labelledby="projection-title">
          <div class="projection-heading"><h2 id="projection-title">Future savings projection</h2><span>£{{ aprilTotal }} by April</span></div>
          <p>Illustrative monthly growth</p>
          <svg viewBox="0 0 360 112" preserveAspectRatio="xMinYMid meet" role="img" aria-label="Hardcoded exponential savings projection from £131 in November to £587 in April">
            <path d="M12 16H348 M12 48H348 M12 80H348" class="projection-grid" />
            <path :d="projectionPath" class="projection-curve" />
            <g v-for="(month,index) in projectionMonths" :key="month">
              <circle :cx="projectionPoint(index).x" :cy="projectionPoint(index).y" r="2.8" class="projection-dot"><title>{{month}}: £{{Math.round(base*Math.pow(1.35,index))}}</title></circle>
              <text :x="projectionPoint(index).x" y="106" :text-anchor="index===0?'start':index===5?'end':'middle'">{{month}}</text>
            </g>
          </svg>
        </section>
        <GoalImpact :saved="base" />
      </div>
      <div class="receipt-position">
        <article class="paper-receipt" aria-labelledby="receipt-title" data-receipt>
          <h2 id="receipt-title">NOVEMBER RECEIPT</h2>
          <section class="receipt-section receipt-avoided"><h3>DIDN'T BUY</h3>
            <dl><div v-for="item in avoided" :key="item.title"><dt>{{ item.title }}</dt><dd>£{{ item.amount }}</dd></div><div v-for="(entry, n) in kh.entries" :key="'kh'+n" data-keephard-entry><dt>{{ entry.label.slice(0, 28) }}</dt><dd>£{{ fmt(Number(entry.amount)) }}</dd></div></dl>
          </section>
          <section class="receipt-section receipt-bought"><h3>BOUGHT</h3>
            <dl><div v-for="item in bought" :key="item.title"><dt>{{ item.title }}</dt><dd>£{{ item.amount }}</dd></div></dl>
          </section>
          <dl class="receipt-total"><div><dt>SAVED</dt><dd>£{{ fmt(base) }}</dd></div></dl>
        </article>
      </div>
      <section class="recap-goals" aria-labelledby="goals-title">
          <h2 id="goals-title">Your goals</h2>
          <ul><li>Save for sports equipment</li><li>Spend less on takeaways</li><li>Build an emergency savings fund</li><li>No alcohol this month</li><li v-for="g in shownGoals" :key="g.id" class="goal-chip" data-goal-chip><i class="gdot" :class="goalDot(base, g)"></i>{{ g.emoji ? g.emoji + ' ' : '' }}{{ g.label.slice(0, 20) }} · £{{ fmt(g.amount) }}</li></ul>
          <AddGoalButton />
        </section>
    </div>
  </section>
</template>
