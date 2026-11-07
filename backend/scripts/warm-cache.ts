import '../src/env.js';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/env.js';
import { readCached, synthesize } from '../src/tts-cache.js';

const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/shared/demo-search-cached.json'), 'utf8'));
const lines = [
  'Why do you need these shoes?',
  'This is not a valid reason. Come on.',
  'Okay, training. Fair.',
  'Buy these and your flight home slips. Here is a cheaper pair.',
  demo.spokenLine,
  'Same shoes, £20 cheaper. That is your flight home.',
  'Sam, you saved £40 last month. Proud of you. Your flight home is that much closer.',
  'Fresh month, fresh start. Every pound you keep gets you closer to your flight home.',
  "I couldn't hear you. Type your reason instead.",
  "I'm having trouble connecting. You can type your reason below.",
  'Nothing cheaper out there. Your call.', 'Hunted everywhere. That is the best price. Your call.', 'No better deal. Your call, not mine.',
  'Hello!!!!', 'Hellooo? Anyone there?', 'Earth to Sam! Are you still with me?', 'Hey! Still there?', 'Come on, talk to me!',
  'Go on.', 'Still there?', 'Right then. I am waiting.', 'Not like you, that. Go on.', 'Take your time. Not too much of it, mind.',
];
const alts = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/shared/demo-alternatives.json'), 'utf8'));
for (const h of Object.values<any>(alts)) {
  lines.push(h.spokenLine, `Not in that colour, but closest I could find. Same ${h.brand}, ${Math.round(h.savings)} pounds cheaper.`);
  for (const v of Object.values<any>(h.variants ?? {})) lines.push(v.spokenLine);
}
let ok = 0;
for (const t of [...new Set(lines)]) {
  if (readCached(t)) { ok++; continue; }
  try { await synthesize(t); ok++; console.log('generated:', t.slice(0, 40)); } catch (e: any) { console.error('FAILED:', t.slice(0, 40), e.message); }
}
console.log(`${ok}/${new Set(lines).size} cached`);
