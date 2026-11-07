import { cachedFor } from './cache';
import { filterOffers, sortCheapest, type Offer } from './filter';
import { liveOffers } from './live';

export interface AlternativesResponse {
  alternative: Offer | null;
  others?: Offer[];
  source: 'live' | 'cache' | 'none';
}

/** The whole lookup (search + extraction) must finish within this, or we use the cache. */
export const TIMEOUT_MS = 6000;

/** Live search with a hard timeout; on any failure (or no live match) the cached demo result. Never throws. */
export async function findAlternative(
  item: string,
  price: number,
  timeoutMs = TIMEOUT_MS,
): Promise<AlternativesResponse & { reason?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let reason: string | undefined;
  try {
    const offers = sortCheapest(filterOffers(await liveOffers(item, price, ctrl.signal), item, price));
    const [best, ...others] = offers;
    if (best) return { alternative: best, others, source: 'live' };
    reason = 'no live match';
  } catch (e) {
    reason = ctrl.signal.aborted ? 'timeout' : e instanceof Error ? e.message : String(e);
  } finally {
    clearTimeout(timer);
  }
  const cached = cachedFor(item, price);
  if (cached) return { ...cached, source: 'cache', reason };
  return { alternative: null, source: 'none', reason };
}
