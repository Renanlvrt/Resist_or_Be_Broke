/**
 * Live search: Firecrawl finds the model at UK retailers, OpenAI reads each page into a structured offer.
 * Only the item title is sent to Firecrawl/OpenAI (plus page content they fetch). No user finances.
 */
import Firecrawl, { type Document, type SearchResultWeb } from '@mendable/firecrawl-js';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { UK_DOMAINS, ukRetailer, type Offer } from './filter';
import { buildQuery, parseModel } from './query';

export class MissingKeysError extends Error {
  constructor() {
    super('FIRECRAWL_API_KEY / OPENAI_API_KEY not set');
  }
}

/** One search hit, trimmed for the extraction prompt. */
export interface Page {
  url: string;
  title: string;
  content: string;
}

const PAGE_CHARS = 3500;
/** Firecrawl may reuse pages it indexed in the last 2 days: much faster than a fresh scrape. */
const MAX_AGE_MS = 2 * 24 * 3600 * 1000;

export const ExtractionSchema = z.object({
  offers: z.array(
    z.object({
      /** Index of the page in the list we sent; the URL is taken from our list, never from the model. */
      page: z.number().int(),
      title: z.string(),
      price: z.number().nullable(),
      seller: z.string(),
      condition: z.string(),
    }),
  ),
});

export function toPages(web: Array<SearchResultWeb | Document> | undefined): Page[] {
  const pages: Page[] = [];
  for (const r of web ?? []) {
    const doc = r as Document & Partial<SearchResultWeb>;
    const url = doc.url ?? doc.metadata?.sourceURL ?? doc.metadata?.url;
    if (!url) continue;
    const title = doc.title ?? doc.metadata?.title ?? '';
    const content = (doc.markdown ?? doc.description ?? doc.metadata?.description ?? '').slice(0, PAGE_CHARS);
    pages.push({ url, title, content });
  }
  return pages;
}

export async function searchPages(title: string, signal: AbortSignal): Promise<Page[]> {
  const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY, timeoutMs: 5000, maxRetries: 0 });
  const res = await abortable(
    firecrawl.search(buildQuery(title), {
      sources: ['web'],
      includeDomains: UK_DOMAINS,
      country: 'GB',
      limit: 5,
      timeout: 4500,
      scrapeOptions: { formats: ['markdown'], onlyMainContent: true, maxAge: MAX_AGE_MS, blockAds: true },
    }),
    signal,
  );
  // Domain filter is a hint to the search engine; the allow-list (incl. nike.com/gb only) is enforced here.
  return toPages(res.web).filter((p) => ukRetailer(p.url));
}

export async function extractOffers(
  title: string,
  price: number,
  pages: Page[],
  signal: AbortSignal,
): Promise<Offer[]> {
  if (pages.length === 0) return [];
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
  const m = parseModel(title);
  const list = pages.map((p, i) => `[${i}] ${p.url}\nTitle: ${p.title}\n${p.content}`).join('\n\n---\n\n');
  const completion = await openai.chat.completions.parse(
    {
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0,
      response_format: zodResponseFormat(ExtractionSchema, 'offers'),
      messages: [
        {
          role: 'system',
          content:
            'You read UK retailer pages and extract product offers. For each page, if it sells the requested model, ' +
            'return one offer: the product title as shown, the current selling price in GBP as a number (the sale price ' +
            'if discounted; null if no price is shown), the retailer name, and condition ("new", "used" or "refurbished"). ' +
            'If a page lists several products, return the cheapest one that is the requested model. Skip pages that do ' +
            'not sell the requested model. Never invent prices.',
        },
        {
          role: 'user',
          content:
            `Requested model: ${m.name}${m.code ? ` (style code ${m.code})` : ''}. Original price: £${price}.\n\n` + list,
        },
      ],
    },
    { signal, timeout: 5500 },
  );
  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) return [];
  const offers: Offer[] = [];
  for (const o of parsed.offers) {
    const page = pages[o.page];
    if (!page || o.price == null) continue;
    offers.push({ title: o.title, price: o.price, seller: o.seller, condition: o.condition, url: page.url });
  }
  return offers;
}

/** Firecrawl's SDK takes no AbortSignal, so race it. */
function abortable<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('aborted'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** Firecrawl search → OpenAI extraction. Throws on missing keys, timeout or API errors. */
export async function liveOffers(title: string, price: number, signal: AbortSignal): Promise<Offer[]> {
  if (!process.env.FIRECRAWL_API_KEY || !process.env.OPENAI_API_KEY) throw new MissingKeysError();
  const pages = await searchPages(title, signal);
  return extractOffers(title, price, pages, signal);
}
