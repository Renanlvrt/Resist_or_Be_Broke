import type { Alternative, PurchaseRequest } from '@resist/engine';
import type { BackendRequest, BackendResponse } from '../background';

/**
 * Calls the backend through the service worker. Resolves null on timeout, error or when
 * running outside the extension — callers always have a local fallback.
 */
export async function callBackend<T>(path: string, body: unknown, timeoutMs: number): Promise<T | null> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return null;
  const msg: BackendRequest = { type: 'backend', path, body, timeoutMs };
  const race = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs + 250));
  try {
    const res = (await Promise.race([chrome.runtime.sendMessage(msg), race])) as BackendResponse | null;
    return res && res.ok ? (res.data as T) : null;
  } catch {
    return null;
  }
}

/** A match as returned by /api/alternatives, before the engine adds saving + lowestIfChosen. */
export type RawAlternative = Pick<Alternative, 'title' | 'price' | 'seller' | 'condition' | 'url'>;

export interface AlternativesResponse {
  alternative: RawAlternative | null;
  others?: RawAlternative[];
  source: 'live' | 'cache' | 'none';
}

/** Backend budget is 6 s; give the relay a little extra. */
export const ALTERNATIVE_TIMEOUT_MS = 6500;

/**
 * Same result the backend serves from its cache (verified with Firecrawl on the day). Used locally only when
 * the backend can't be reached at all, so the demo survives with Wi-Fi off.
 */
export const OFFLINE_AIR_MAX_90: RawAlternative = {
  title: 'Nike Air Max 90 Premium',
  price: 94.49,
  seller: 'Nike UK',
  condition: 'new',
  url: 'https://www.nike.com/gb/w/mens-air-max-90-shoes-auqmoznik1zy7ok',
};

/**
 * Cheaper same-model option. Sends only the item title and price (never balance, bills or income).
 */
export async function fetchAlternative(req: Pick<PurchaseRequest, 'item' | 'price'>): Promise<RawAlternative | null> {
  const data = await callBackend<AlternativesResponse>(
    '/api/alternatives',
    { item: req.item, price: req.price },
    ALTERNATIVE_TIMEOUT_MS,
  );
  if (data) return isRaw(data.alternative) ? data.alternative : null;
  // Backend unreachable: offline fallback for the demo product only.
  if (/air\s*max\s*90/i.test(req.item) && OFFLINE_AIR_MAX_90.price < req.price) return OFFLINE_AIR_MAX_90;
  return null;
}

function isRaw(a: unknown): a is RawAlternative {
  if (!a || typeof a !== 'object') return false;
  const o = a as Record<string, unknown>;
  return (
    typeof o.title === 'string' &&
    typeof o.price === 'number' &&
    typeof o.seller === 'string' &&
    typeof o.url === 'string' &&
    /^https?:\/\//.test(o.url)
  );
}

const NOISE = new Set([
  "men's", 'mens', "women's", 'womens', "kids'", 'kids', 'unisex', 'trainers', 'trainer', 'shoes', 'shoe',
  'sneakers', 'running', 'uk',
]);

/** "Nike Air Max 90 Men's Trainers (CN8490-002)" → "Nike Air Max 90". For copy, not matching. */
export function modelName(title: string): string {
  const t = title.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
  const head = t.split(/\s[-–—|]\s|[,(\[|]/)[0] ?? t;
  const words = head
    .split(' ')
    .filter((w) => w && !NOISE.has(w.toLowerCase()) && !/^[A-Z]{1,3}\d{3,5}-\d{3}$/.test(w))
    .slice(0, 6);
  return words.join(' ') || t;
}
