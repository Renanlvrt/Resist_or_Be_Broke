<script setup lang="ts">
// This recap is intentionally a fixed visual demo, independent of mock finance state.
const emit = defineEmits<{ close: [] }>();
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
  { title: 'Running shoes', amount: 65 },
  { title: 'Gym bag', amount: 28 },
  { title: 'Coffee maker', amount: 38 },
];
const bought = [
  { title: 'Phone case', amount: 12 },
  { title: 'Snacks', amount: 8 },
  { title: 'Dinner', amount: 24 },
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
        <div class="recap-savings"><strong data-saved-amount>£131</strong><span>Saved this month</span></div>
        <section class="savings-projection" aria-labelledby="projection-title">
          <div class="projection-heading"><h2 id="projection-title">Future savings projection</h2><span>£587 by April</span></div>
          <p>Illustrative monthly growth</p>
          <svg viewBox="0 0 360 112" role="img" aria-label="Hardcoded exponential savings projection from £131 in November to £587 in April">
            <path d="M12 16H348 M12 48H348 M12 80H348" class="projection-grid" />
            <path :d="projectionPath" class="projection-curve" />
            <g v-for="(month,index) in projectionMonths" :key="month">
              <circle :cx="projectionPoint(index).x" :cy="projectionPoint(index).y" r="2.8" class="projection-dot"><title>{{month}}: £{{Math.round(131*Math.pow(1.35,index))}}</title></circle>
              <text :x="projectionPoint(index).x" y="106" :text-anchor="index===0?'start':index===5?'end':'middle'">{{month}}</text>
            </g>
          </svg>
        </section>
        <section class="recap-goals" aria-labelledby="goals-title">
          <h2 id="goals-title">Your financial goals</h2>
          <ul><li>Save for sports equipment</li><li>Spend less on takeaways</li><li>Build an emergency savings fund</li><li>No alcohol this month</li></ul>
        </section>
      </div>
      <div class="receipt-position">
        <article class="paper-receipt" aria-labelledby="receipt-title" data-receipt>
          <h2 id="receipt-title">NOVEMBER RECEIPT</h2>
          <section class="receipt-section receipt-avoided"><h3>DIDN'T BUY</h3>
            <dl><div v-for="item in avoided" :key="item.title"><dt>{{ item.title }}</dt><dd>£{{ item.amount }}</dd></div></dl>
          </section>
          <section class="receipt-section receipt-bought"><h3>BOUGHT</h3>
            <dl><div v-for="item in bought" :key="item.title"><dt>{{ item.title }}</dt><dd>£{{ item.amount }}</dd></div></dl>
          </section>
          <dl class="receipt-total"><div><dt>SAVED</dt><dd>£131</dd></div></dl>
        </article>
      </div>
    </div>
  </section>
</template>
