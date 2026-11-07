import { Router } from 'express';
import { z } from 'zod';
import { askClaude, extractJson } from '../claude.js';
import fs from 'node:fs';
import { readCached, cachePath, TTS_DIR } from '../tts-cache.js';

const router = Router();
const CATS = ['sport', 'fashion', 'eating_out', 'groceries', 'tech', 'other'] as const;

const VerdictZ = z.object({
  verdict: z.enum(['accept', 'reject']),
  reasonCategory: z.enum(CATS),
  userReasonSummary: z.string(),
  spokenLine: z.string(),
});

function dynamicVariables(profile: any, product: any) {
  const c = profile?.categories ?? {};
  const rules = CATS.map((k) => `${k} (limit £${c[k]?.limit ?? 0}): ${c[k]?.rule ?? ''}`).join('; ');
  return {
    product_title: String(product?.title ?? ''),
    price: String(product?.price ?? ''),
    brand: String(product?.brand ?? ''),
    sport_limit: String(c.sport?.limit ?? 0),
    fashion_limit: String(c.fashion?.limit ?? 0),
    rules,
  };
}

router.post('/session', async (req, res) => {
  const { profile, product } = req.body ?? {};
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const key = process.env.ELEVENLABS_API_KEY;
  if (!agentId || !key) return res.status(500).json({ error: 'ElevenLabs not configured' });
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, { headers: { 'xi-api-key': key } });
    if (!r.ok) return res.status(502).json({ error: `elevenlabs ${r.status}`, detail: await r.text() });
    const { signed_url } = (await r.json()) as any;
    res.json({ signedUrl: signed_url, agentId, dynamicVariables: dynamicVariables(profile, product) });
  } catch (e: any) {
    res.status(502).json({ error: String(e?.message ?? e) });
  }
});

router.post('/speak', async (req, res) => {
  const text = String(req.body?.text ?? '').trim();
  const key = process.env.ELEVENLABS_API_KEY;
  const hit = text ? readCached(text) : null;
  if (hit) { res.setHeader('Content-Type', 'audio/mpeg'); res.setHeader('X-TTS-Cache', 'hit'); return res.send(hit); }
  if (!text || !key) return res.status(400).json({ error: 'text and key required' });
  const voice = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5' }),
    });
    if (!r.ok || !r.body) return res.status(502).json({ error: `elevenlabs ${r.status}`, detail: await r.text() });
    const buf = Buffer.from(await r.arrayBuffer());
    try { fs.mkdirSync(TTS_DIR, { recursive: true }); fs.writeFileSync(cachePath(text), buf); } catch {}
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(buf);
  } catch (e: any) {
    res.status(502).json({ error: String(e?.message ?? e) });
  }
});

function keywordVerdict(userText: string, round: number) {
  const t = userText.toLowerCase();
  const has = (w: string[]) => w.some((x) => t.includes(x));
  const summary = userText.slice(0, 80);
  if (has(['fashion', 'friend', 'everyone', 'look', 'style', 'trend']))
    return { verdict: 'reject', reasonCategory: 'fashion', userReasonSummary: summary, spokenLine: "Not a valid reason. But if you really want them, here is a cheaper pair." };
  if (has(['track', 'training', 'run', 'sport', 'gym', 'race']))
    return { verdict: 'accept', reasonCategory: 'sport', userReasonSummary: summary, spokenLine: "Fair reason. Here is a cheaper pair anyway." };
  return round >= 2
    ? { verdict: 'accept', reasonCategory: 'other', userReasonSummary: summary, spokenLine: "Fair reason. Here is a cheaper pair anyway." }
    : { verdict: 'reject', reasonCategory: 'other', userReasonSummary: summary, spokenLine: "Not a valid reason. But if you really want them, here is a cheaper pair." };
}

router.post('/judge', async (req, res) => {
  const { profile, product, userText = '', round = 1 } = req.body ?? {};
  const sys = 'You are KeepHard, a short, punchy, supportive student money coach. Judge whether the user\'s reason for buying fits their budget rules. Reject fashion or "friend has it" reasons; accept sport/training reasons within limits. Decide immediately in one round. Reject spokenLine: Not a valid reason. But if you really want them, here is a cheaper pair. Accept spokenLine: Fair reason. Here is a cheaper pair anyway. Reply with ONLY JSON: {"verdict":"accept"|"reject","reasonCategory":"sport"|"fashion"|"eating_out"|"groceries"|"tech"|"other","userReasonSummary":string,"spokenLine":string (max 12 words, one short sentence, no preamble, no emotion tags)}.';
  const usr = `Rules: ${JSON.stringify(dynamicVariables(profile, product))}\nProduct: ${product?.title} £${product?.price}\nRound: ${round}\nUser said: "${userText}"`;
  try {
    const out = await askClaude(sys, usr, 2000, 300);
    return res.json(VerdictZ.parse(extractJson(out)));
  } catch {
    return res.json(keywordVerdict(String(userText), Number(round)));
  }
});

export default router;
