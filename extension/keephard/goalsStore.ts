import { reactive } from 'vue';
import { browser } from 'wxt/browser';
import { HOLIDAY_RATE } from '../lib/holiday';

export interface GoalItem { id: string; label: string; amount: number; by: string; emoji?: string; createdAt: string }
export const GOALS_KEY = 'keephard.goals';
export const BACKEND = 'http://localhost:8787';

/** Goals added with "Add a new goal" (mirror of backend profile.goals appended by POST /api/goals). */
export const goalsState = reactive({ goals: [] as GoalItem[] });

const ok = (g: any): g is GoalItem => !!g && typeof g.id === 'string' && typeof g.label === 'string' && Number.isFinite(Number(g.amount));
export function applyGoals(v: unknown) {
  goalsState.goals = Array.isArray(v) ? (v as any[]).filter(ok).map(g => ({ ...g, amount: Number(g.amount) })) : [];
}
export async function loadGoals() {
  try { applyGoals(((await browser.storage.local.get(GOALS_KEY)) as Record<string, unknown>)?.[GOALS_KEY]); } catch { /* storage unavailable */ }
}
export function watchGoals(): () => void {
  const fn = (changes: Record<string, { newValue?: unknown }>, area: string) => { if (area === 'local' && changes[GOALS_KEY]) applyGoals(changes[GOALS_KEY]!.newValue); };
  try { browser.storage.onChanged?.addListener(fn); } catch { /* ignore */ }
  return () => { try { browser.storage.onChanged?.removeListener(fn); } catch { /* ignore */ } };
}

/** Fetch via the background proxy (content scripts cannot reach http://localhost:8787 directly); plain fetch elsewhere. */
export const proxyFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  const c = (globalThis as any).chrome;
  if (!c?.runtime?.sendMessage) return fetch(input, init);
  const res = await c.runtime.sendMessage({ type: 'keephard:fetch', url, method: init?.method, headers: init?.headers, body: typeof init?.body === 'string' ? init.body : undefined });
  if (!res || res.error) throw new Error(res?.error || 'no response from background');
  const bin = atob(res.body || '');
  const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Response(u, { status: res.status, headers: { 'content-type': res.contentType } });
};

/** Append a goal (never replaces): backend first (ids, profile.json), then chrome.storage.local so the dashboard updates at once.
 *  If the backend is down a structured goal is still kept locally. `input` is {label, amount, by, emoji?} or {text} (typed fallback). */
export async function addGoal(input: { label?: string; amount?: number; by?: string; emoji?: string; text?: string }, f: typeof fetch = proxyFetch): Promise<GoalItem> {
  let goal: GoalItem | undefined;
  try {
    const r = await f(`${BACKEND}/api/goals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    if (r.ok) { const g = await r.json(); if (ok(g)) goal = { ...g, amount: Number(g.amount) }; }
    else if (input.text) throw new Error('goals ' + r.status);
  } catch (e) { if (input.text) throw e; }
  if (!goal) {
    if (!input.label || !(Number(input.amount) > 0) || !input.by) throw new Error('incomplete goal');
    goal = { id: 'local-' + Date.now().toString(36), label: input.label, amount: Number(input.amount), by: input.by, emoji: input.emoji, createdAt: new Date().toISOString() };
  }
  const next = [...goalsState.goals.filter(g => g.id !== goal!.id), goal];
  goalsState.goals = next;
  try { await browser.storage.local.set({ [GOALS_KEY]: next }); } catch { /* storage unavailable: in-memory only */ }
  return goal;
}

export type Dot = 'green' | 'amber' | 'red';
const monthsUntil = (by: string, now: Date) => {
  const d = new Date(by + 'T00:00:00');
  return Math.max(0, (d.getFullYear() - now.getFullYear()) * 12 + d.getMonth() - now.getMonth());
};
/** Same projection as the Summer holiday card (saved compounding at HOLIDAY_RATE per month), generalised to any date.
 *  green: projected >= target, amber: >= 70%, red: below. */
export function goalDot(saved: number, g: Pick<GoalItem, 'amount' | 'by'>, now = new Date()): Dot {
  const projected = saved * Math.pow(HOLIDAY_RATE, monthsUntil(g.by, now));
  return projected >= g.amount ? 'green' : projected >= g.amount * 0.7 ? 'amber' : 'red';
}
