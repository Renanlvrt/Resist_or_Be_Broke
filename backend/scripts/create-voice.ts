import '../src/env.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { ENV_PATH } from '../src/env.js';

const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error('ELEVENLABS_API_KEY missing');
const H = { 'xi-api-key': key, 'content-type': 'application/json' };

const voice_description = 'Native British English, Yorkshire accent. Male, 40s. Studio quality.\nPersona: Deadpan, caring older brother. Emotion: Dry, warm, calm.\nLow, relaxed baritone with understated delivery, where the humour comes from timing and a raised eyebrow, not from volume. Gets plain and direct, with no jokes, when the stakes are real.';
const text = "Your weapons are but toothpicks to me. [laughs] Surrender now and I may grant you a swift end. I've toppled kingdoms and devoured armies. What hope do you have against me?";

const d = await fetch('https://api.elevenlabs.io/v1/text-to-voice/design', {
  method: 'POST', headers: H,
  body: JSON.stringify({ voice_description, text, loudness: 0.5, guidance_scale: 5, seed: 212366, model_id: 'eleven_multilingual_ttv_v2' }),
});
const dt = await d.text();
if (!d.ok) { console.error(`design ${d.status}: ${dt}`); process.exit(1); }
const previews = JSON.parse(dt).previews as { generated_voice_id: string }[];
if (!previews?.length) { console.error('no previews returned'); process.exit(1); }

const c = await fetch('https://api.elevenlabs.io/v1/text-to-voice', {
  method: 'POST', headers: H,
  body: JSON.stringify({ voice_name: 'KeepHard Older Brother', voice_description, generated_voice_id: previews[0].generated_voice_id }),
});
const ct = await c.text();
if (!c.ok) { console.error(`create ${c.status}: ${ct}`); process.exit(1); }
const id = JSON.parse(ct).voice_id as string;
let env = readFileSync(ENV_PATH, 'utf8');
env = /^ELEVENLABS_VOICE_ID=.*$/m.test(env) ? env.replace(/^ELEVENLABS_VOICE_ID=.*$/m, `ELEVENLABS_VOICE_ID=${id}`) : env + `\nELEVENLABS_VOICE_ID=${id}\n`;
writeFileSync(ENV_PATH, env);
console.log('voice saved to .env, length', id.length);
