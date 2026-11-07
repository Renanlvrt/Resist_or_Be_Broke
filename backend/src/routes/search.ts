import { Router } from 'express';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../env.js';
import { liveSearch } from '../search/live.js';

const router = Router();
const shared = (f: string) => JSON.parse(readFileSync(path.join(ROOT, 'packages/shared', f), 'utf8'));
const asinOf = (u?: string) => /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i.exec(u ?? '')?.[1]?.toUpperCase();

router.post('/', async (req, res) => {
  const product = req.body?.product ?? {};
  const asin = asinOf(product.url);
  const demoAlts = shared('demo-alternatives.json');
  const hit = asin && demoAlts[asin];
  if (hit) {
    return res.json({ found: true, alternative: hit.alternative, savings: hit.savings, spokenLine: hit.spokenLine, cached: true });
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
