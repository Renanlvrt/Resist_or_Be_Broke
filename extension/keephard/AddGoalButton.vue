<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { addGoal } from './goalsStore';
import { startGoalSession, type GoalPhase, type GoalSession } from './addGoal';

// "+ Add a new goal": starts the short live voice interview; typed input if the mic or session fails.
const phase = ref<GoalPhase>('idle');
const line = ref('');
const err = ref('');
const text = ref('');
const busy = ref(false);
const added = ref('');
let session: GoalSession | undefined, clearT: ReturnType<typeof setTimeout> | undefined;

const live = computed(() => ['connecting', 'listening', 'talking'].includes(phase.value));
const chipText = computed(() => phase.value === 'connecting' ? 'Connecting...' : phase.value === 'talking' ? 'Speaking...' : 'Listening...');

function flash(label: string) {
  added.value = label; phase.value = 'idle'; line.value = '';
  clearTimeout(clearT); clearT = setTimeout(() => { added.value = ''; }, 3500);
}
async function start() {
  err.value = ''; line.value = ''; added.value = '';
  session?.stop();
  session = await startGoalSession({
    onPhase: p => { if (p === 'done') return; if (p === 'idle' && added.value) return; phase.value = p; },
    onCaption: (t, who) => { line.value = (who === 'user' ? 'You: ' : '') + t; },
    onGoal: g => flash(`${g.emoji ? g.emoji + ' ' : ''}${g.label} added`),
    onFallback: r => { err.value = /mic|permission|denied|notallowed/i.test(r) ? 'Mic unavailable. Type your goal.' : 'Voice unavailable. Type your goal.'; line.value = ''; },
  });
}
function stop() { session?.stop(); session = undefined; phase.value = 'idle'; line.value = ''; }
async function submit() {
  const t = text.value.trim(); if (!t || busy.value) return;
  busy.value = true; err.value = '';
  try { const g = await addGoal({ text: t }); text.value = ''; flash(`${g.emoji ? g.emoji + ' ' : ''}${g.label} added`); }
  catch { err.value = 'Try: Spain trip, 300 pounds, by August.'; }
  finally { busy.value = false; }
}
onBeforeUnmount(() => { session?.stop(); clearTimeout(clearT); });
</script>

<template>
  <div class="add-goal" data-add-goal>
    <template v-if="live">
      <span class="ag-chip" :class="phase" data-ag-listening><i></i>{{ chipText }}</span>
      <span class="ag-line" data-ag-transcript>{{ line }}</span>
      <button type="button" class="ag-x" aria-label="Cancel" @click="stop">×</button>
    </template>
    <template v-else-if="phase === 'typed'">
      <form class="ag-form" @submit.prevent="submit">
        <input v-model="text" data-ag-input maxlength="120" placeholder="e.g. Spain trip in August, £300" aria-label="Describe your new goal" />
        <button type="submit" :disabled="busy" data-ag-submit>Add</button>
        <button type="button" class="ag-x" aria-label="Cancel" @click="stop">×</button>
      </form>
      <span class="ag-err" data-ag-err v-if="err">{{ err }}</span>
    </template>
    <template v-else>
      <button type="button" class="ag-btn" data-ag-button @click="start">+ Add a new goal</button>
      <span class="ag-ok" data-ag-added v-if="added">{{ added }}</span>
    </template>
  </div>
</template>
