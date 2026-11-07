import { Router } from 'express';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../env.js';
import { askClaude, extractJson } from '../claude.js';

const router = Router();
const Cat = z.object({ limit: z.number(), rule: z.string() });
const ProfileZ = z.object({
  name: z.string(),
  monthlyBudget: z.number(),
  categories: z.object({ sport: Cat, fashion: Cat, eating_out: Cat, groceries: Cat, tech: Cat, other: Cat }),
  goal: z.object({ label: z.string(), amount: z.number(), saved: z.number(), by: z.string() }),
  savedByKeepHard: z.number(),
  tone: z.literal('supportive'),
});

const demo = () => JSON.parse(readFileSync(path.join(ROOT, 'packages/shared/demo-profile.json'), 'utf8'));

router.post('/', async (req, res) => {
  const answers: string[] = Array.isArray(req.body?.answers) ? req.body.answers.map(String).slice(0, 3) : [];
  const sys = 'Turn a student\'s monthly budget interview answers into a JSON profile. Reply ONLY with JSON: {"name":string,"monthlyBudget":number,"categories":{"sport","fashion","eating_out","groceries","tech","other"} each {"limit":number (GBP),"rule":string (user\'s own words)},"goal":{"label":string,"amount":number,"saved":number,"by":"YYYY-MM-DD"},"savedByKeepHard":0,"tone":"supportive"}. Infer sensibly; limit 0 for unmentioned discretionary categories.';
  try {
    const out = await askClaude(sys, answers.map((a, i) => `A${i + 1}: ${a}`).join('\n'), 8000, 800);
    return res.json(ProfileZ.parse(extractJson(out)));
  } catch {
    return res.json(demo());
  }
});

export default router;
