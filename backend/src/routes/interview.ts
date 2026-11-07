import { Router } from 'express';
import { z } from 'zod';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../env.js';
import { askClaude, extractJson } from '../claude.js';

const router = Router();
export const profileRouter = Router();
const CATS = ['sport', 'fashion', 'eating_out', 'groceries', 'tech', 'other'] as const;
const Cat = z.object({ limit: z.number(), rule: z.string() });
const ProfileZ = z.object({
  name: z.string(),
  monthlyBudget: z.number(),
  categories: z.object({ sport: Cat, fashion: Cat, eating_out: Cat, groceries: Cat, tech: Cat, other: Cat }),
  goal: z.object({ label: z.string(), amount: z.number(), saved: z.number(), by: z.string() }),
  savedByKeepHard: z.number(),
  goals: z.array(z.object({ id: z.string(), label: z.string(), amount: z.number(), by: z.string(), emoji: z.string().optional(), createdAt: z.string() })).optional(),
  tone: z.literal('supportive'),
});

const PROFILE_PATH = path.join(ROOT, 'backend/data/profile.json');
const demo = () => JSON.parse(readFileSync(path.join(ROOT, 'packages/shared/demo-profile.json'), 'utf8'));
function saved() {
  try { return ProfileZ.parse(JSON.parse(readFileSync(PROFILE_PATH, 'utf8'))); } catch { return null; }
}
function persist(p: any) {
  try {
    // keep goals appended via /api/goals when a new interview rewrites the profile
    if (p && !p.goals) { const old = saved(); if (old?.goals) p = { ...p, goals: old.goals }; } mkdirSync(path.dirname(PROFILE_PATH), { recursive: true }); writeFileSync(PROFILE_PATH, JSON.stringify(p, null, 2)); } catch { /* best effort */ }
}

const Save = z.object({
  monthlyBudget: z.coerce.number(),
  goalLabel: z.string(),
  goalAmount: z.coerce.number(),
  goalBy: z.string(),
  noSpendCategories: z.string().optional().default(''),
  summary: z.string().optional().default(''),
});

const KEYWORDS: Record<string, string[]> = {
  sport: ['sport', 'gym', 'running', 'trainer'],
  fashion: ['fashion', 'cloth', 'shoe', 'sneaker', 'style', 'shopping'],
  eating_out: ['eating_out', 'eating out', 'takeaway', 'restaurant', 'food', 'coffee', 'delivery'],
  groceries: ['grocer', 'supermarket'],
  tech: ['tech', 'gadget', 'electronic', 'phone', 'headphone', 'gaming'],
  other: ['other', 'everything else', 'impulse'],
};

/** Deterministic Profile from the agent's save_profile payload, merged onto the demo profile. */
function fromSaveProfile(raw: unknown) {
  const s = Save.parse(raw);
  const p = demo();
  const lc = s.noSpendCategories.toLowerCase();
  p.monthlyBudget = s.monthlyBudget;
  p.goal = { label: s.goalLabel, amount: s.goalAmount, saved: 0, by: s.goalBy };
  for (const c of CATS) {
    if (KEYWORDS[c].some((k) => lc.includes(k))) p.categories[c] = { limit: 0, rule: `No ${c.replace('_', ' ')} this month` };
  }
  return ProfileZ.parse(p);
}

router.post('/session', async (_req, res) => {
  const agentId = process.env.ELEVENLABS_INTERVIEWER_AGENT_ID;
  const key = process.env.ELEVENLABS_API_KEY;
  if (!agentId || !key) return res.status(500).json({ error: 'ElevenLabs interviewer not configured' });
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, { headers: { 'xi-api-key': key } });
    if (!r.ok) return res.status(502).json({ error: `elevenlabs ${r.status}`, detail: await r.text() });
    const { signed_url } = (await r.json()) as any;
    res.json({ signedUrl: signed_url, agentId });
  } catch (e: any) {
    res.status(502).json({ error: String(e?.message ?? e) });
  }
});

router.post('/', async (req, res) => {
  // save_profile payload from the live agent
  if (req.body?.saveProfile) {
    try { const p = fromSaveProfile(req.body.saveProfile); persist(p); return res.json(p); } catch { /* fall through */ }
  }
  const answers: string[] = Array.isArray(req.body?.answers) ? req.body.answers.map(String).slice(0, 3) : [];
  const sys = 'Turn a student\'s monthly budget interview answers into a JSON profile. Reply ONLY with JSON: {"name":string,"monthlyBudget":number,"categories":{"sport","fashion","eating_out","groceries","tech","other"} each {"limit":number (GBP),"rule":string (user\'s own words)},"goal":{"label":string,"amount":number,"saved":number,"by":"YYYY-MM-DD"},"savedByKeepHard":0,"tone":"supportive"}. Infer sensibly; limit 0 for unmentioned discretionary categories.';
  try {
    const out = await askClaude(sys, answers.map((a, i) => `A${i + 1}: ${a}`).join('\n'), 8000, 800);
    const p = ProfileZ.parse(extractJson(out));
    persist(p);
    return res.json(p);
  } catch {
    const p = demo();
    persist(p);
    return res.json(p);
  }
});

profileRouter.get('/', (_req, res) => {
  const p: any = saved() ?? demo();
  res.json(p.goals ? p : { ...p, goals: [{ id: 'goal-0', ...p.goal, createdAt: '2026-11-07T00:00:00.000Z' }] });
});

export default router;
