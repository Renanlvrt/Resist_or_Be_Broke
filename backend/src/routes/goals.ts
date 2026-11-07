import { Router } from 'express';
import { z } from 'zod';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ROOT } from '../env.js';
import { askClaude, extractJson } from '../claude.js';

const router = Router();
const PROFILE_PATH = path.join(ROOT, 'backend/data/profile.json');
const DEMO_PATH = path.join(ROOT, 'packages/shared/demo-profile.json');
const TODAY = () => new Date();

const GoalIn = z.object({
  label: z.string().trim().min(1).max(60),
  amount: z.coerce.number().positive().max(1_000_000),
  by: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  emoji: z.string().max(8).optional(),
});

function load(): any {
  try { return JSON.parse(readFileSync(PROFILE_PATH, 'utf8')); } catch { /* fall through */ }
  return JSON.parse(readFileSync(DEMO_PATH, 'utf8'));
}
function write(p: unknown) {
  mkdirSync(path.dirname(PROFILE_PATH), { recursive: true });
  writeFileSync(PROFILE_PATH, JSON.stringify(p, null, 2));
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** Last day of the next occurrence of month m (0-11) after `now`. */
function nextMonthEnd(m: number, now = TODAY()): string {
  let y = now.getFullYear();
  const end = (yy: number) => new Date(Date.UTC(yy, m + 1, 0));
  if (end(y) <= now) y++;
  return end(y).toISOString().slice(0, 10);
}
/** Deterministic text -> goal, used when Claude is unavailable. Returns null if no amount found. */
export function parseGoalText(text: string, now = TODAY()) {
  const amt = text.replace(/,/g, '').match(/(?:£|\b)(\d+(?:\.\d+)?)\s*(k\b)?/i);
  if (!amt) return null;
  let amount = Number(amt[1]); if (amt[2]) amount *= 1000;
  const lc = text.toLowerCase();
  const mi = MONTHS.findIndex((m) => new RegExp(`\b${m}[a-z]*\b`).test(lc) && !(m === 'may' && !/\bmay\b/.test(lc)));
  const by = /summer/.test(lc) ? '2027-06-30' : mi >= 0 ? nextMonthEnd(mi, now) : /next year/.test(lc) ? `${now.getFullYear() + 1}-12-31` : new Date(Date.UTC(now.getFullYear(), now.getMonth() + 6, 0)).toISOString().slice(0, 10);
  const label = text.replace(/(?:£\s*)?\d[\d,.]*\s*(?:k\b|pounds?|quid|gbp)?/gi, ' ').replace(/\b(about|around|roughly|for|by|in|on|a|an|the|of|i|am|want|to|plan(?:ning)?|going|save|saving|this|next|summer|winter|spring|autumn|january|february|march|april|may|june|july|august|september|october|november|december|pounds?)\b/gi, ' ').replace(/[^\w\s'-]/g, ' ').replace(/\s+/g, ' ').trim();
  const t = /\btrip\b/i.test(text) ? (text.match(/(?:to|in)\s+([A-Z][a-z]+)/)?.[1] ?? '') : '';
  return { label: (t ? `${t} trip` : label || 'New goal').slice(0, 40), amount, by };
}

async function fromText(text: string) {
  try {
    const sys = `Turn a student's spoken saving goal into JSON. Reply ONLY with {"label":string (short),"amount":number (GBP),"by":"YYYY-MM-DD","emoji":string (one emoji)}. Today is ${TODAY().toISOString().slice(0, 10)}. "this summer" = 2027-06-30; a month name = the last day of its next occurrence. Guess sensibly if unclear.`;
    return GoalIn.parse(extractJson(await askClaude(sys, text, 6000, 200)));
  } catch { /* fall back */ }
  const d = parseGoalText(text);
  return d ? GoalIn.parse(d) : null;
}

router.post('/session', async (_req, res) => {
  const agentId = process.env.ELEVENLABS_GOAL_AGENT_ID;
  const key = process.env.ELEVENLABS_API_KEY;
  if (!agentId || !key) return res.status(500).json({ error: 'ElevenLabs goal agent not configured' });
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, { headers: { 'xi-api-key': key } });
    if (!r.ok) return res.status(502).json({ error: `elevenlabs ${r.status}`, detail: await r.text() });
    const { signed_url } = (await r.json()) as any;
    res.json({ signedUrl: signed_url, agentId });
  } catch (e: any) {
    res.status(502).json({ error: String(e?.message ?? e) });
  }
});

/** Append a goal. Body: {label, amount, by, emoji?} (from the live agent) or {text} (typed fallback). */
router.post('/', async (req, res) => {
  let g: z.infer<typeof GoalIn> | null = null;
  if (typeof req.body?.text === 'string' && req.body.text.trim()) g = await fromText(req.body.text.slice(0, 300));
  else { const r = GoalIn.safeParse(req.body); if (r.success) g = r.data; }
  if (!g) return res.status(400).json({ error: 'could not understand the goal: need label, amount and by' });
  const p = load();
  if (!Array.isArray(p.goals)) p.goals = p.goal ? [{ id: 'goal-0', ...p.goal, createdAt: '2026-11-07T00:00:00.000Z' }] : [];
  const goal = { id: randomUUID(), ...g, createdAt: new Date().toISOString() };
  p.goals.push(goal);
  try { write(p); } catch { /* best effort: still return the goal so the UI can mirror it */ }
  res.json(goal);
});

router.get('/', (_req, res) => {
  const p = load();
  res.json(Array.isArray(p.goals) ? p.goals : []);
});

export default router;
