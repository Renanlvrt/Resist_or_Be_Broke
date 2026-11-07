import '../src/env.js';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/env.js';
import { readCached, synthesize } from '../src/tts-cache.js';

const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/shared/demo-search-cached.json'), 'utf8'));
const lines = [
  'Why do you need these shoes?',
  'Really?! This is not like you. Fashion is off this month. Here is a cheaper pair.',
  'Okay, training. Fair. Still, here is a cheaper pair.',
  demo.spokenLine,
  'Same shoes, £20 cheaper. That is your flight home.',
  'Sam, you saved £40 last month. Proud of you. Your flight home is that much closer.',
  'Fresh month, fresh start. Every pound you keep gets you closer to your flight home.',
  "I couldn't hear you. Type your reason instead.",
  "I'm having trouble connecting. You can type your reason below.",
  'Hello!!!!', 'Hellooo? Anyone there?', 'Earth to Sam! Are you still with me?', 'Hey! Still there?', 'Come on, talk to me!',
];
let ok = 0;
for (const t of [...new Set(lines)]) {
  if (readCached(t)) { ok++; continue; }
  try { await synthesize(t); ok++; console.log('generated:', t.slice(0, 40)); } catch (e: any) { console.error('FAILED:', t.slice(0, 40), e.message); }
}
console.log(`${ok}/${new Set(lines).size} cached`);
