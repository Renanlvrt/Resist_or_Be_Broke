import { Router } from 'express';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../env.js';
import { liveSearch } from '../search/live.js';

const router = Router();
const shared = (f: string) => JSON.parse(readFileSync(path.join(ROOT, 'packages/shared', f), 'utf8'));
const asinOf = (u?: string) => /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i.exec(u ?? '')?.[1]?.toUpperCase();

const COLOURS = ['red', 'orange', 'black', 'white', 'blue', 'grey', 'gray', 'green', 'pink', 'yellow', 'purple'];
const colourIn = (t?: string) => {
  const words = (t ?? '').toLowerCase().split(/[^a-z]+/);
  const c = COLOURS.find((w) => words.includes(w));
  return c === 'gray' ? 'grey' : c;
};
const mismatchLine = (hit: any) =>
  `Not in that colour, but closest I could find. Same ${hit.brand}, ${Math.round(hit.savings)} pounds cheaper.`;

const cap = (c?: string) => (c ? c[0].toUpperCase() + c.slice(1) : undefined);
const withColour = (alt: any, matched?: string) => ({ ...alt, colour: cap(alt.colour) ?? matched, matchedColour: matched });

function findDemo(demoAlts: any, product: any): any {
  const ids = [asinOf(product.url), product.asin, ...(Array.isArray(product.altAsins) ? product.altAsins : [])]
    .filter((x) => typeof x === 'string').map((x) => x.toUpperCase());
  for (const [k, v] of Object.entries<any>(demoAlts)) if (ids.some((i) => i === k || v.aliases?.includes(i))) return v;
  const hay = `${product.brand ?? ''} ${product.title ?? ''}`.toLowerCase();
  for (const v of Object.values<any>(demoAlts)) if (v.match?.every((m: string) => hay.includes(m))) return v;
  return undefined;
}

router.post('/', async (req, res) => {
  const product = req.body?.product ?? {};
  const demoAlts = shared('demo-alternatives.json');
  const hit = findDemo(demoAlts, product);
  if (hit) {
    const colour = colourIn(req.body?.reasonText);
    const v = colour && hit.variants?.[colour];
    if (v) return res.json({ found: true, alternative: withColour(v.alternative, cap(colour)), matchedColour: cap(v.alternative.colour), savings: v.savings, spokenLine: v.spokenLine, cached: true });
    const mismatch = colour && hit.alternative.colour && hit.alternative.colour !== colour;
    return res.json({ found: true, alternative: withColour(hit.alternative, cap(hit.alternative.colour)), matchedColour: cap(hit.alternative.colour), savings: hit.savings,
      spokenLine: mismatch ? mismatchLine(hit) : hit.spokenLine, cached: true });
  }
  if (req.query.demo !== '1' && product.title && process.env.FIRECRAWL_API_KEY && process.env.ANTHROPIC_API_KEY) {
    const alt = await liveSearch(product.title, product.brand ?? '', Number(product.price) || 0);
    if (alt) {
      const savings = Math.round((product.price - alt.price) * 100) / 100;
      return res.json({ found: true, alternative: alt, savings,
        spokenLine: `Same ${product.brand ?? ''} ${savings.toFixed(0)} pounds cheaper at ${alt.retailer}. That is your flight home.`.replace('  ', ' '), cached: false });
    }
  }
  const base = shared('demo-search-cached.json');
  const q = encodeURIComponent(`${product.brand ?? ''} ${product.title ?? ''}`.trim());
  res.json({ ...base, alternative: { ...base.alternative, title: product.title ?? base.alternative.title,
    brand: product.brand ?? base.alternative.brand, url: `https://www.google.com/search?tbm=shop&q=${q}`, sameModel: false } });
});
export default router;
