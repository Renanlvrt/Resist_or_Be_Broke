// POST /api/search  (owner: search teammate)
// SearchRequest -> SearchResult. Order:
//   1. Known demo products (packages/shared/demo-alternatives.json: ASIN, alias or keywords; colour-aware
//      via `reasonText`): verified alternative, instant.
//   2. Live (not ?demo=1): Firecrawl searches named UK retailers for the same model, Claude reads the
//      pages into offers, we keep only same-model, cheaper, UK offers and return the cheapest.
//      Results are memoised (30 min) and `?prefetch=1` starts a search early so the real call is instant.
//   3. Otherwise found:false. We never invent a price or saving.
// Privacy: only the product's title/brand/price leave the device. Never the profile.
import { Router } from 'express';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../env.js';
import { askClaude, extractJson } from '../claude.js';
import type { Product, SearchResult } from '../../../packages/shared/types.js';

/** Whole request budget; past this we answer from the cache (demo product) or "not found". */
export const BUDGET_MS = 6000;
/** A prefetch runs in the background, so it can wait for cold pages (scrapes measured 2-6 s cold, 0.2 s warm). */
export const PREFETCH_BUDGET_MS = 15000;
const MEMO_TTL_MS = 30 * 60_000;
const SEARCH_MS = 2000;
const MAX_SCRAPE_MS = 10000;
const CLAUDE_RESERVE_MS = 2000;
const MAX_CANDIDATES = 3;
const PAGE_CHARS = 2500;

/** Named UK retailers only. Amazon is where the user already is, so it's never an "alternative". */
export const RETAILERS = [
  { host: 'nike.com', path: '/gb', name: 'Nike UK' },
  { host: 'sportsshoes.com', name: 'SportsShoes' },
  { host: 'jdsports.co.uk', name: 'JD Sports' },
  { host: 'footlocker.co.uk', name: 'Foot Locker UK' },
  { host: 'sportsdirect.com', name: 'Sports Direct' },
  { host: 'ebay.co.uk', name: 'eBay UK' },
] as const;

// ---------- pure helpers (unit-tested) ----------

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const NOISE = /\b(men'?s|women'?s|unisex|kids'?|running|road|trail|shoes?|trainers?|sneakers?|size|uk|eu|us|new|black|white|blue|red|grey|gray|green|pink)\b/gi;

/** Nike-style product code (e.g. CN8490-002, FD2722-002) or a generic AAA123-123 code. */
export function productCode(title: string): string | null {
  return title.match(/\b[A-Z]{1,3}\d{3,5}-\d{3}\b/)?.[0] ?? null;
}

/** "Nike Pegasus 41 Running Shoes (FD2722-002)" -> "Nike Pegasus 41" */
export function modelName(product: Pick<Product, 'title' | 'brand'>): string {
  const code = productCode(product.title);
  let t = product.title.replace(/\([^)]*\)/g, ' ');
  if (code) t = t.replace(code, ' ');
  t = t.replace(NOISE, ' ').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
  const brand = product.brand?.trim();
  if (brand && !new RegExp(`^${escapeRe(brand)}\\b`, 'i').test(t)) t = `${brand} ${t}`;
  return t;
}

export function buildQuery(product: Pick<Product, 'title' | 'brand'>): string {
  const code = productCode(product.title);
  return [modelName(product), code].filter(Boolean).join(' ');
}

/** Retailer display name for an allowed UK URL, else null. */
export function retailerFor(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '');
  const r = RETAILERS.find((r) => host === r.host || host.endsWith(`.${r.host}`));
  if (!r) return null;
  if ('path' in r && !u.pathname.startsWith(r.path)) return null;
  return r.name;
}

/** Variant words that make a different product (seen in real results: "Pegasus 41 GORE-TEX", "By You" custom). */
const VARIANTS = /\b(gore[\s-]?tex|gtx|trail|by you|premium|shield|flyease|wide|kids?|junior|gs)\b/gi;

/**
 * Same model = every word of the model name appears as a whole word (so "Pegasus 41" rejects
 * "Pegasus 40" and "Pegasus 410"), no variant word the original lacks (GORE-TEX, Trail, By You...),
 * and if both sides carry a product code, the codes match.
 */
export function isSameModel(candidateTitle: string, model: string, code: string | null, originalTitle = model): boolean {
  const words = model.toLowerCase().split(/\s+/).filter(Boolean);
  const cand = ` ${candidateTitle.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  if (!words.every((w) => cand.includes(` ${w.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `))) return false;
  const orig = originalTitle.toLowerCase();
  const extra = (candidateTitle.match(VARIANTS) ?? []).filter((v) => !orig.includes(v.toLowerCase()));
  if (extra.length) return false;
  const candCode = productCode(candidateTitle);
  return !(code && candCode && candCode !== code);
}

export interface Offer {
  title: string;
  price: number;
  url: string;
  retailer: string;
}

/** Cheapest valid offer: allowed UK retailer, same model, cheaper, and not suspiciously cheap (laces, deposits). */
export function pickCheapest(offers: Offer[], product: Pick<Product, 'title' | 'brand' | 'price'>): Offer | null {
  const model = modelName(product);
  const code = productCode(product.title);
  const valid = offers.filter(
    (o) =>
      retailerFor(o.url) !== null &&
      isSameModel(o.title, model, code, product.title) &&
      Number.isFinite(o.price) &&
      o.price < product.price &&
      o.price >= product.price * 0.25,
  );
  valid.sort((a, b) => a.price - b.price);
  return valid[0] ?? null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => (Number.isInteger(round2(n)) ? `£${round2(n)}` : `£${round2(n).toFixed(2)}`);

/** Template line, used when Claude's line is missing or doesn't state the right numbers. */
export function templateLine(model: string, savings: number, retailer: string): string {
  return `If you really need them, the exact same ${model} is ${money(savings)} cheaper at ${retailer}.`;
}

/** Accept Claude's line only if it's short and mentions the right saving or price. */
export function acceptLine(line: unknown, savings: number, price: number): line is string {
  if (typeof line !== 'string' || !line.trim()) return false;
  if (line.split(/\s+/).length > 25) return false;
  const nums = [savings, price].flatMap((n) => [String(Math.round(n)), round2(n).toFixed(2)]);
  return nums.some((n) => line.includes(n)) || /\btwenty|thirty|forty|fifty\b/i.test(line);
}

// ---------- demo data + fallback ----------

const shared = (f: string) => JSON.parse(readFileSync(path.join(ROOT, 'packages/shared', f), 'utf8'));
export const cachedResult = (): SearchResult => shared('demo-search-cached.json');
const asinOf = (u?: string) => /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i.exec(u ?? '')?.[1]?.toUpperCase();

// ---- Curated demo alternatives (B's logic from main, unchanged): ASIN / aliases / keyword match, colour-aware ----
const COLOURS = ['red', 'orange', 'black', 'white', 'blue', 'grey', 'gray', 'green', 'pink', 'yellow', 'purple'];
const colourIn = (t?: string) => {
  const words = (t ?? '').toLowerCase().split(/[^a-z]+/);
  const c = COLOURS.find((w) => words.includes(w));
  return c === 'gray' ? 'grey' : c;
};
const mismatchLine = (hit: any) =>
  `Not in that colour, but closest I could find. Same ${hit.brand}, ${Math.round(hit.savings)} pounds cheaper.`;

const cap = (c?: string) => (c ? c[0]!.toUpperCase() + c.slice(1) : undefined);
const withColour = (alt: any, matched?: string) => ({ ...alt, colour: cap(alt.colour) ?? matched, matchedColour: matched });

function findDemo(demoAlts: any, product: any): any {
  const ids = [asinOf(product.url), product.asin, ...(Array.isArray(product.altAsins) ? product.altAsins : [])]
    .filter((x) => typeof x === 'string').map((x) => x.toUpperCase());
  for (const [k, v] of Object.entries<any>(demoAlts)) if (ids.some((i) => i === k || v.aliases?.includes(i))) return v;
  const hay = `${product.brand ?? ''} ${product.title ?? ''}`.toLowerCase();
  for (const v of Object.values<any>(demoAlts)) if (v.match?.every((m: string) => hay.includes(m))) return v;
  return undefined;
}

/** Verified alternative for a known demo product (ASIN, alias or keywords), colour-aware via the user's reason. */
export function curatedFor(product: any, reasonText?: string): (SearchResult & { matchedColour?: string }) | null {
  const hit = findDemo(shared('demo-alternatives.json'), product ?? {});
  if (!hit) return null;
  if (Number(product?.price) > 0 && Number(hit.alternative?.price) >= Number(product.price)) return null; // must really be cheaper
  const colour = colourIn(reasonText);
  const v = colour && hit.variants?.[colour];
  if (v) return { found: true, alternative: withColour(v.alternative, cap(colour)), matchedColour: cap(v.alternative.colour), savings: v.savings, spokenLine: v.spokenLine, cached: true };
  const mismatch = colour && hit.alternative.colour && hit.alternative.colour !== colour;
  return { found: true, alternative: withColour(hit.alternative, cap(hit.alternative.colour)), matchedColour: cap(hit.alternative.colour), savings: hit.savings,
    spokenLine: mismatch ? mismatchLine(hit) : hit.spokenLine, cached: true };
}

/** Last resort: never invent a price or saving. */
export function fallbackResult(_product: Partial<Product>): SearchResult {
  return { found: false, savings: 0, spokenLine: '', cached: false };
}

// ---------- live path ----------

interface Page {
  url: string;
  title: string;
  markdown: string;
}

const firecrawl = async (endpoint: 'search' | 'scrape', body: object, timeoutMs: number): Promise<any> => {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error('no FIRECRAWL_API_KEY');
  const r = await fetch(`https://api.firecrawl.dev/v2/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, timeout: Math.max(1000, timeoutMs - 300) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`firecrawl ${endpoint} ${r.status}`);
  return r.json();
};

/**
 * Step 1: search WITHOUT scraping (~0.4 s; search+scrape of 5 results measured 17 s cold).
 * Keep only allowed UK retailers whose result title is the same model (drops GORE-TEX, "By You",
 * category pages) so we only pay to scrape real candidates.
 */
export async function findCandidates(product: Product): Promise<{ url: string; title: string }[]> {
  const j = await firecrawl(
    'search',
    { query: buildQuery(product), limit: 5, sources: ['web'], includeDomains: RETAILERS.map((r) => r.host), country: 'GB' },
    SEARCH_MS,
  );
  const model = modelName(product);
  const code = productCode(product.title);
  const web: any[] = j?.data?.web ?? [];
  return web
    .map((w) => ({ url: String(w?.url ?? ''), title: String(w?.title ?? '') }))
    .filter((w) => retailerFor(w.url) && isSameModel(w.title, model, code, product.title))
    .slice(0, MAX_CANDIDATES);
}

/** Step 2: scrape the candidates in parallel. maxAge lets Firecrawl serve pages it saw in the last 2 days (~0.2 s). */
async function scrapePages(cands: { url: string; title: string }[], timeoutMs: number): Promise<{ pages: Page[]; errors: string[] }> {
  const settled = await Promise.allSettled(
    cands.map((c) =>
      firecrawl('scrape', { url: c.url, formats: ['markdown'], onlyMainContent: true, maxAge: 172_800_000 }, timeoutMs).then(
        (j): Page => ({ url: c.url, title: c.title, markdown: String(j?.data?.markdown ?? '') }),
      ),
    ),
  );
  return {
    pages: settled.flatMap((s) => (s.status === 'fulfilled' && s.value.markdown ? [s.value] : [])),
    errors: settled.flatMap((s) => (s.status === 'rejected' ? [String(s.reason?.message ?? s.reason)] : [])),
  };
}

/** Category/search/listing pages (many products on one page): only Claude may read prices from these. */
export function isListingPage(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    if (/\/(w|collection|collections|search|c|browse)\//i.test(pathname)) return true;
    // Sports Direct product pages are one segment ending in an id: /nike-pegasus-41-road-running-shoes-mens-210014
    return hostname.endsWith('sportsdirect.com') && !/^\/[^/]+-\d+\/?$/.test(pathname);
  } catch {
    return true;
  }
}

/**
 * Fallback when Claude is slow or unavailable: on a product page the first £ amount in the main
 * content is the current price (e.g. Sports Direct: "£69.00" before "was £129.99"). Only used on
 * pages that already passed the same-model title check.
 */
export function firstPrice(markdown: string): number | null {
  for (const m of markdown.matchAll(/£\s?(\d{1,4}(?:,\d{3})*(?:\.\d{2})?)/g)) {
    const n = Number(m[1]!.replace(/,/g, ''));
    if (n > 0) return n;
  }
  return null;
}

const ClaudeOut = z.object({
  offers: z.array(z.object({ page: z.number().int(), title: z.string(), price: z.number().nullable() })),
  best: z.number().int().nullable().optional(),
  spokenLine: z.string().optional(),
});

const SYSTEM = `You read UK shop pages and extract offers for ONE exact product model.
Reply with JSON only, no prose:
{"offers":[{"page":<page number>,"title":"<product title on that page>","price":<current GBP price as a number, or null>}],
 "best":<page number of the cheapest offer for the exact same model, or null>,
 "spokenLine":"<one friendly sentence under 20 words saying how much cheaper it is and where>"}
Rules: only the exact model asked for (a different version number is a different model). Use the current selling price, not RRP or "was" prices.
If a page is a listing of several products, pick the matching one. Never invent prices.`;

async function claudeExtract(product: Product, model: string, pages: Page[], timeoutMs: number) {
  const user = [
    `Model: ${model}${productCode(product.title) ? ` (code ${productCode(product.title)})` : ''}`,
    `Price on Amazon: £${product.price}`,
    ...pages.map((p, i) => `--- page ${i}: ${retailerFor(p.url)} | ${p.title}\n${p.markdown.slice(0, PAGE_CHARS)}`),
  ].join('\n\n');
  return ClaudeOut.parse(extractJson(await askClaude(SYSTEM, user, timeoutMs, 600)));
}

export async function liveSearch(product: Product, deadline: number): Promise<{ result: SearchResult | null; note: string }> {
  const model = modelName(product);
  const left = () => deadline - Date.now();
  const cands = await findCandidates(product);
  if (!cands.length) return { result: null, note: 'no same-model candidates' };
  const { pages, errors } = await scrapePages(cands, Math.min(MAX_SCRAPE_MS, Math.max(1000, left() - CLAUDE_RESERVE_MS)));
  if (!pages.length) return { result: null, note: `scrape failed (${errors.join('; ') || 'empty pages'})` };

  let out: z.infer<typeof ClaudeOut> | null = null;
  let note = 'claude';
  try {
    out = await claudeExtract(product, model, pages, Math.max(500, left()));
  } catch (e: any) {
    note = `no claude (${String(e?.message ?? e)}), price parser`;
  }
  // URLs always come from Firecrawl's results by page index, never from the model.
  const offers: Offer[] = out
    ? out.offers.flatMap((o) => {
        const p = pages[o.page];
        const retailer = p && retailerFor(p.url);
        return p && retailer && o.price !== null ? [{ title: o.title, price: o.price, url: p.url, retailer }] : [];
      })
    : pages.flatMap((p) => {
        if (isListingPage(p.url)) return []; // first £ on a listing could be a different shoe
        const price = firstPrice(p.markdown);
        return price !== null ? [{ title: p.title, price, url: p.url, retailer: retailerFor(p.url)! }] : [];
      });
  const best = pickCheapest(offers, product);
  if (!best) return { result: null, note: `${note}, nothing cheaper` };
  const savings = round2(product.price - best.price);
  const claudePickedSame = !!out && out.best !== undefined && out.best !== null && pages[out.best]?.url === best.url;
  return {
    note,
    result: {
      found: true,
      alternative: { title: cleanTitle(best.title), brand: product.brand, price: best.price, url: best.url, retailer: best.retailer, sameModel: true },
      savings,
      spokenLine: claudePickedSame && acceptLine(out!.spokenLine, savings, best.price) ? out!.spokenLine! : templateLine(model, savings, best.retailer),
      cached: false,
    },
  };
}

/** "Nike | Pegasus 41 Road Running Shoes Mens - Sports Direct" -> "Nike Pegasus 41 Road Running Shoes Mens" */
export function cleanTitle(t: string): string {
  return t.replace(/\s*[-|]\s*(Sports Direct|JD Sports|Foot Locker.*|SportsShoes.*|Nike( UK| GB)?|eBay)\s*$/i, '').replace(/\s*\|\s*/g, ' ').trim();
}

export interface Lookup {
  result: SearchResult | null;
  reason: string;
}

/** Live search within `budgetMs`. Never throws: { result: null, reason } on timeout, error, missing keys or no match. */
export async function findCheaper(product: Product, budgetMs = BUDGET_MS): Promise<Lookup> {
  const deadline = Date.now() + budgetMs;
  let timer: NodeJS.Timeout | undefined;
  try {
    const live = await Promise.race([
      liveSearch(product, deadline - 300),
      new Promise<never>((_, rej) => (timer = setTimeout(() => rej(new Error('timeout')), budgetMs))),
    ]);
    return { result: live.result, reason: live.note };
  } catch (e: any) {
    return { result: null, reason: String(e?.message ?? e) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Memoised + de-duplicated: a prefetch and the real call for the same product share one search.
 * Real answers (a match, or "nothing cheaper") are kept; errors (timeout, Firecrawl/scrape failures) are retried.
 */
const isAnswer = (r: Lookup) => !!r.result || /nothing cheaper|no same-model candidates/.test(r.reason);
const memo = new Map<string, { at: number; p: Promise<Lookup> }>();
export function lookup(product: Product, budgetMs = BUDGET_MS): Promise<Lookup> {
  const k = `${buildQuery(product).toLowerCase()}|${product.price}`;
  const hit = memo.get(k);
  if (hit && Date.now() - hit.at < MEMO_TTL_MS) return hit.p;
  const p = findCheaper(product, budgetMs).then((r) => {
    if (!isAnswer(r)) memo.delete(k);
    return r;
  });
  memo.set(k, { at: Date.now(), p });
  return p;
}
export const clearMemo = () => memo.clear();

async function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([p, new Promise<null>((r) => (timer = setTimeout(() => r(null), ms)))]);
  } finally {
    clearTimeout(timer);
  }
}

// ---------- route ----------

// Lenient: the extension may send a product before the price has rendered. Without title+price we skip live search.
const ProductZ = z.object({
  title: z.string().min(1).max(300),
  brand: z.string().max(100).default(''),
  price: z.coerce.number().positive(),
  currency: z.literal('GBP').default('GBP'),
  url: z.string().default(''),
  site: z.string().default('amazon.co.uk'),
  imageUrl: z.string().optional(),
});

const router = Router();
router.post('/', async (req, res) => {
  const t0 = Date.now();
  const product: Partial<Product> = req.body?.product ?? {};
  const log = (r: SearchResult, how: string) =>
    console.log(`[search] "${product.title ?? '?'}" £${product.price ?? '?'} -> ${r.alternative ? `£${r.alternative.price} ${r.alternative.retailer}` : 'none'} (${how}, ${Date.now() - t0}ms)`);

  const curated = curatedFor(product, req.body?.reasonText);
  if (curated) {
    if (req.query.prefetch === '1') return res.status(202).json({ prefetching: false });
    log(curated, 'demo ASIN');
    return res.json(curated);
  }
  const parsed = ProductZ.safeParse(product);
  const live = req.query.demo !== '1' && parsed.success;

  if (req.query.prefetch === '1') {
    if (live) void lookup(parsed.data as Product, PREFETCH_BUDGET_MS);
    return res.status(202).json({ prefetching: live });
  }

  let reason = req.query.demo === '1' ? 'demo mode' : 'no title/price';
  if (live) {
    const r = await within(lookup(parsed.data as Product), BUDGET_MS);
    if (r?.result) {
      log(r.result, `live, ${r.reason}`);
      return res.json(r.result);
    }
    reason = r ? r.reason : 'live still running (kept for next time)';
  }
  const fb = fallbackResult(product);
  log(fb, `fallback, ${reason}`);
  res.json(fb);
});
export default router;
