/** Pure rules for which offers count as "the same model, cheaper, from a UK seller". */
import { parseModel, productCode, type ParsedModel } from './query';

export interface Offer {
  title: string;
  price: number;
  seller: string;
  condition: string;
  url: string;
}

export interface Retailer {
  /** Host, matched exactly or as a parent domain (www.footlocker.co.uk → footlocker.co.uk). */
  host: string;
  /** Required path prefix (nike.com is global; only /gb is the UK store). */
  path?: string;
  label: string;
}

export const UK_RETAILERS: readonly Retailer[] = [
  { host: 'nike.com', path: '/gb', label: 'Nike UK' },
  { host: 'footlocker.co.uk', label: 'Foot Locker UK' },
  { host: 'jdsports.co.uk', label: 'JD Sports' },
  { host: 'sportsdirect.com', label: 'Sports Direct' },
  { host: 'ebay.co.uk', label: 'eBay UK' },
];

/** Hostnames for the search engine's domain filter. */
export const UK_DOMAINS: string[] = UK_RETAILERS.map((r) => r.host);

/** The allow-listed UK retailer for a URL, or null (bad URL, other host, nike.com outside /gb). */
export function ukRetailer(url: string): Retailer | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  for (const r of UK_RETAILERS) {
    const hostOk = host === r.host || host.endsWith(`.${r.host}`);
    const pathOk = !r.path || u.pathname === r.path || u.pathname.startsWith(`${r.path}/`);
    if (hostOk && pathOk) return r;
  }
  return null;
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Same model: every model token ("air", "max", "90") appears as a whole word in the offer title
 * (so "Air Max 95" and "Air Max 900" don't match), and if both sides carry a product code they agree.
 */
export function isSameModel(offerTitle: string, original: ParsedModel): boolean {
  const want = tokens(original.model || original.name);
  if (want.length === 0) return false;
  const have = new Set(tokens(offerTitle));
  if (!want.every((w) => have.has(w))) return false;
  const offerCode = productCode(offerTitle);
  if (original.code && offerCode && offerCode !== original.code) return false;
  return true;
}

/** Below this share of the original price it's almost certainly an accessory, a deposit or a misread. */
export const MIN_PRICE_SHARE = 0.25;

export function isCheaper(price: number, original: number): boolean {
  return Number.isFinite(price) && price > 0 && price < original && price >= original * MIN_PRICE_SHARE;
}

/** Keep offers that are the same model, cheaper, and from an allow-listed UK seller. Seller label comes from the host. */
export function filterOffers(offers: Offer[], originalTitle: string, originalPrice: number): Offer[] {
  const model = parseModel(originalTitle);
  const out: Offer[] = [];
  const seen = new Set<string>();
  for (const o of offers) {
    const r = ukRetailer(o.url);
    if (!r) continue;
    if (!isSameModel(o.title, model)) continue;
    const price = Math.round(o.price * 100) / 100;
    if (!isCheaper(price, originalPrice)) continue;
    const key = `${r.label}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...o, price, seller: r.label, condition: (o.condition || 'new').toLowerCase() });
  }
  return out;
}

/** Cheapest first (ties: new before used). */
export function sortCheapest(offers: Offer[]): Offer[] {
  const rank = (o: Offer) => (o.condition === 'new' ? 0 : 1);
  return [...offers].sort((a, b) => a.price - b.price || rank(a) - rank(b));
}

export function pickCheapest(offers: Offer[]): Offer | null {
  return sortCheapest(offers)[0] ?? null;
}
