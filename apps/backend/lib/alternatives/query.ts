/**
 * Turns a noisy shop title into the bits that identify the model:
 * "Nike Air Max 90 Men's Trainers (CN8490-002)" → brand "Nike", model "Air Max 90", code "CN8490-002".
 * Pure, no I/O.
 */

export interface ParsedModel {
  /** First word of the title, e.g. "Nike". */
  brand: string;
  /** Model without brand or noise, e.g. "Air Max 90". */
  model: string;
  /** Brand + model, e.g. "Nike Air Max 90". */
  name: string;
  /** Manufacturer style/product code if the title has one, e.g. "CN8490-002". */
  code: string | null;
}

/** Style codes such as CN8490-002 (Nike), DD1391-100, FZ5808-400; also IE3438 style (adidas). */
const CODE_RE = /\b([A-Z]{1,3}\d{3,5}-\d{3}|[A-Z]{2}\d{4})\b/;

/** Words that describe the listing, not the model. Removed wherever they appear. */
const NOISE = new Set(
  [
    "men's", 'mens', 'men', "women's", 'womens', 'women', "kids'", "kid's", 'kids', 'junior', 'juniors', 'boys', "boys'",
    'girls', "girls'", 'unisex', 'adult', 'adults', 'trainers', 'trainer', 'shoes', 'shoe', 'sneakers', 'sneaker',
    'running', 'lifestyle', 'casual', 'sports', 'footwear', 'uk', 'size', 'new', 'sale', 'official', 'genuine',
  ].map((w) => w.toLowerCase()),
);

/** Normalise curly apostrophes so "Men’s" and "Men's" are the same word. */
function clean(s: string): string {
  return s.replace(/[‘’ʼ]/g, "'").replace(/\s+/g, ' ').trim();
}

export function productCode(title: string): string | null {
  return clean(title).toUpperCase().match(CODE_RE)?.[1] ?? null;
}

export function parseModel(title: string): ParsedModel {
  const t = clean(title);
  const code = productCode(t);
  // Everything after a separator is colour/size/variant detail ("…, Black, 9 UK", "… (CN8490-002)", "… | JD").
  const head = t.split(/\s[-–—|]\s|[,(\[|]/)[0] ?? t;
  const words = head
    .split(' ')
    .filter((w) => w && !NOISE.has(w.toLowerCase()) && !(code && w.toUpperCase().includes(code)))
    .slice(0, 6);
  const brand = words[0] ?? '';
  const model = words.slice(1).join(' ');
  return { brand, model, name: words.join(' '), code };
}

/** Search query: "<brand model> <code>", e.g. "Nike Air Max 90 CN8490-002". */
export function buildQuery(title: string): string {
  const m = parseModel(title);
  return [m.name, m.code].filter(Boolean).join(' ').trim();
}
