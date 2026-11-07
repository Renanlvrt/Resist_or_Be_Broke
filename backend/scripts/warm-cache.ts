import '../src/env.js';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/env.js';
import { readCached, synthesize } from '../src/tts-cache.js';

const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/shared/demo-search-cached.json'), 'utf8'));
const lines = [
  'Why do you need these shoes?',
  'Not a valid reason. But if you really want them, here is a cheaper pair.',
  'Fair reason. Here is a cheaper pair anyway.',
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
