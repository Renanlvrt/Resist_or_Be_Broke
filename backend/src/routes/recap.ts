import { Router } from 'express';
import { askClaude } from '../claude.js';

const router = Router();
const gbp = (n: number) => `£${Math.round(n * 100) % 100 === 0 ? Math.round(n) : n.toFixed(2)}`;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const SYS = 'You are KeepHard, a warm, supportive student money coach. Write ONE short spoken line, under 25 words, encouraging, never shaming, no investment advice. Plain text only, no quotes, no emojis.';

async function line(user: string, fallback: string): Promise<string> {
  try {
    const out = (await askClaude(SYS, user, 2000, 120)).trim().replace(/^["']|["']$/g, '');
    if (out && words(out) < 25) return out;
  } catch {}
  return fallback;
}

router.post('/recap', async (req, res) => {
  const { profile, savedThisMonth = 0, savedLastMonth = 0, goal } = req.body ?? {};
  const g = goal ?? profile?.goal ?? {};
  const label = String(g.label ?? 'goal').toLowerCase();
  const remaining = Math.max(0, Number(g.amount ?? 0) - Number(g.saved ?? 0) - Number(savedThisMonth || 0));
  const last = Number(savedLastMonth) || 0;
  const tone = profile?.tone ?? 'supportive';
  const fallback = last > 0
    ? `Last month you saved ${gbp(last)}. Keep going, your ${label} is ${gbp(last)} closer.`
    : `Fresh month, fresh start. Every pound you keep brings your ${label} closer.`;
  const text = await line(`Name: ${profile?.name ?? 'the student'}. Saved last month: £${last}. Saved this month so far: £${savedThisMonth}. Goal: ${g.label} (£${remaining} still to go). Tone: ${tone}.`, fallback);
  res.json({ text, tone });
});

router.post('/savings-line', async (req, res) => {
  const { product, alternative, savings = 0 } = req.body ?? {};
  const name = String(alternative?.title ?? product?.title ?? 'item').replace(/\s*(Running Shoes|Trainers)$/i, '').replace(/\s+\d+$/, '');
  const retailer = String(alternative?.retailer ?? 'another shop');
  const s = gbp(Number(savings) || 0);
  const fallback = `Same ${name}, ${s} cheaper at ${retailer}. That is ${s} toward your flight home.`;
  const text = await line(`Product: ${product?.title}. Cheaper identical alternative at ${retailer}, saving £${savings}. Mention the saving goes toward the user's goal.`, fallback);
  res.json({ text });
});

export default router;
