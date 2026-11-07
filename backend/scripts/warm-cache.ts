import '../src/env.js';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/env.js';
import { readCached, synthesize } from '../src/tts-cache.js';

const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/shared/demo-search-cached.json'), 'utf8'));
const lines = [
  'Quick check before you buy. Why do you need these?',
  "That's a fashion buy, and fashion's off this month. Anything else?",
  "Okay, that's training. Fair. Let me find a better price.",
  'Not convinced yet. Give me a real reason?',
  "Alright, I hear you. Let me check for a cheaper one.",
  demo.spokenLine,
  'Same Nike Pegasus, £20 cheaper at SportsShoes. That is £20 toward your flight home.',
  'Last month you saved £40. Keep going, your flight home is £40 closer.',
  'Fresh month, fresh start. Every pound you keep brings your flight home closer.',
  "I couldn't hear you. Type your reason instead.",
  "I'm having trouble connecting. You can type your reason below.",
];
let ok = 0;
for (const t of [...new Set(lines)]) {
  if (readCached(t)) { ok++; continue; }
  try { await synthesize(t); ok++; console.log('generated:', t.slice(0, 40)); } catch (e: any) { console.error('FAILED:', t.slice(0, 40), e.message); }
}
console.log(`${ok}/${new Set(lines).size} cached`);
