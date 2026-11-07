import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from './env.js';

export const TTS_DIR = path.join(ROOT, 'backend', 'cache', 'tts');
export const MODEL_ID = 'eleven_flash_v2_5';
export const VOICE_SETTINGS = { stability: 0.45, similarity_boost: 0.75, style: 0.1, use_speaker_boost: true };
export const voiceId = () => process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

export function cachePath(text: string, voice = voiceId()): string {
  const h = crypto.createHash('sha1').update(`${voice}|${text.trim()}`).digest('hex').slice(0, 24);
  return path.join(TTS_DIR, `${h}.mp3`);
}

export function readCached(text: string): Buffer | null {
  try { return fs.readFileSync(cachePath(text)); } catch { return null; }
}

export async function synthesize(text: string): Promise<Buffer> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('no ELEVENLABS_API_KEY');
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId()}/stream`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS }),
  });
  if (!r.ok) throw new Error(`elevenlabs ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  try { fs.mkdirSync(TTS_DIR, { recursive: true }); fs.writeFileSync(cachePath(text), buf); } catch {}
  return buf;
}
