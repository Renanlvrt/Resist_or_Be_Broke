import { reactive } from 'vue';
import { browser } from 'wxt/browser';
import type { ImpactView } from './impact';

export interface SavingsEntry { at: string; label: string; amount: number }
export const SAVINGS_KEY = 'keephard.savings';

/** Shared reactive state between the voice composable, the voice layer and the Dashboard. */
export const kh = reactive({
  bridge: false,          // the voice bridge answered the handshake
  enabled: true,          // Alt+Shift+K kill switch state
  active: false,          // a voice session / offer is on screen
  state: 'idle',
  caption: '', userLine: '', error: '', toast: '', typed: false, tap: false,
  offer: null as null | { title: string; retailer: string; colour?: string; price: number; savings: number },
  countdown: 0,
  impact: null as ImpactView | null,
  verdictSeen: false,     // a verdict (decide) arrived in this voice session: the ONLY thing that opens the impact dashboard
  impactTone: 'reject' as 'reject' | 'caution',
  transcript: [] as { id: number; who: 'avatar' | 'user'; text: string }[],
  lingering: false, fading: false,
  recovery: null as null | { amount: number; savedAfter: number },
  extra: 0,               // total saved by KeepHard (storage keephard.savings)
  entries: [] as SavingsEntry[],
});

export function applySavings(v: unknown) {
  const o = (v ?? {}) as { entries?: unknown; savedByKeepHard?: unknown };
  kh.entries = Array.isArray(o.entries) ? (o.entries as SavingsEntry[]).filter(e => e && Number.isFinite(Number(e.amount))) : [];
  kh.extra = Number(o.savedByKeepHard) || 0;
}
export async function loadSavings() {
  try {
    const got = (await browser.storage.local.get(SAVINGS_KEY)) ?? {};
    applySavings((got as Record<string, unknown>)[SAVINGS_KEY]);
  } catch { /* storage unavailable: zero savings */ }
}
export function watchSavings(): () => void {
  const fn = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && changes[SAVINGS_KEY]) applySavings(changes[SAVINGS_KEY]!.newValue);
  };
  try { browser.storage.onChanged?.addListener(fn); } catch { /* ignore */ }
  return () => { try { browser.storage.onChanged?.removeListener(fn); } catch { /* ignore */ } };
}
