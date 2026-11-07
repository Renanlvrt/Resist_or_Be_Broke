import '../src/env.js';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/env.js';
import { readCached, synthesize } from '../src/tts-cache.js';

const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/shared/demo-search-cached.json'), 'utf8'));
const lines = [
  'Why do you need these shoes?',
  'Not a valid reason, come on.',
  'Fair enough, just this once.',
  'Real need, this once.',
  'Go on then, you need them.',
  'Still not a valid reason.',
  'Enjoy them, then.',
  'Treat yourself, once.',
  'Mind the holiday fund.',
  'Do not tell your bank.',
  'Careful, this hits your summer holiday.',
  demo.spokenLine,
  'Same shoes, £20 cheaper. That is your summer holiday.',
  'Sam, you saved £40 last month. Proud of you. Your summer holiday is that much closer.',
  'Fresh month, fresh start. Every pound you keep gets you closer to your summer holiday.',
  "I couldn't hear you. Type your reason instead.",
  "I'm having trouble connecting. You can type your reason below.",
  'Looked everywhere. Not a penny cheaper, I am afraid.', 'Checked the lot. Nowt cheaper. Sorry, pal.', 'Had a proper look. That is as low as it goes.', 'Annoying, but this is the best price going.',
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
