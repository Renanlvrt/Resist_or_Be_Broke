// Pure product detection for Amazon product pages. No chrome.* usage so it is unit-testable in node (linkedom).
export interface DetectedProduct {
  title: string; brand: string; price: number | undefined; currency: 'GBP'; url: string; site: string; image?: string;
  priceDemo?: boolean;
  productKind?: 'shoes' | 'alcohol';
  asin?: string; altAsins?: string[]; colour?: string;
}
export interface DetectResult { product?: DetectedProduct; reason: string; }

export const DEMO_PRICE = 120;
const SHOE_RE = /(shoe|trainer|sneaker|running|boot|sandal|slipper)/i;
// word-boundary match so 'Beginner' / 'Original' / 'Forum' never hit gin / rum etc.
export const ALCOHOL_RE = /\b(wines?|beers?|lagers?|ciders?|vodkas?|whisky|whiskey|whiskies|gins?|rum|prosecco|champagne)\b/i;
const ASIN_RE = /\/(?:dp|gp\/product)\/([A-Z0-9]{8,12})/i;

export function isProductUrl(href: string): boolean {
  try {
    const u = new URL(href);
    if (!/(^|\.)amazon\.[a-z.]+$/i.test(u.hostname)) return false;
    return ASIN_RE.test(u.pathname);
  } catch { return false; }
}

export function parseGbp(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const m = text.replace(/ /g, ' ').match(/£\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/);
  if (!m) return undefined;
  const n = parseFloat(m[1]!.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const PRICE_SELECTORS = [
  '#corePrice_feature_div .a-price .a-offscreen',
  '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
  '#apex_desktop .a-price .a-offscreen',
  '[id^="corePrice"] .a-price .a-offscreen',
  '#priceblock_ourprice', '#priceblock_dealprice',
  '#buybox .a-price .a-offscreen',
  '.a-price:not(.a-text-price) .a-offscreen',
  '.a-price .a-offscreen',
];

export function readPrice(doc: Document): number | undefined {
  for (const sel of PRICE_SELECTORS) {
    for (const el of Array.from(doc.querySelectorAll(sel))) {
      // skip struck-through list prices
      if ((el as Element).closest?.('.a-text-price, [data-a-strike="true"]')) continue;
      const p = parseGbp(el.textContent);
      if (p) return p;
    }
  }
  const whole = doc.querySelector('.a-price-whole')?.textContent?.replace(/[^0-9]/g, '');
  const frac = doc.querySelector('.a-price-fraction')?.textContent?.replace(/[^0-9]/g, '') || '00';
  if (whole) { const n = parseFloat(whole + '.' + frac); if (n > 0) return n; }
  return undefined;
}

const clean = (t: string | null | undefined) => (t || '').replace(/[‎‏ ]/g, ' ').replace(/\s+/g, ' ').trim();

/** ASIN from the detail table / bullets ("ASIN" row), if present. */
export function readTableAsin(doc: Document): string | undefined {
  const ok = (v: string) => { const m = clean(v).replace(/^[:\s]+/, '').match(/^[A-Z0-9]{10}$/i); return m ? m[0].toUpperCase() : undefined; };
  for (const tr of Array.from(doc.querySelectorAll('tr'))) {
    const th = tr.querySelector('th'), td = tr.querySelector('td');
    if (th && td && /^ASIN$/i.test(clean(th.textContent))) { const a = ok(td.textContent || ''); if (a) return a; }
  }
  for (const li of Array.from(doc.querySelectorAll('#detailBullets_feature_div li, #detailBulletsWrapper_feature_div li'))) {
    const m = clean(li.textContent).match(/^ASIN\s*:?\s*([A-Z0-9]{10})/i);
    if (m) return m[1]!.toUpperCase();
  }
  return undefined;
}

/** Selected colour, from "Colour: X" selection text. */
export function readColour(doc: Document): string | undefined {
  for (const sel of ['#variation_color_name .selection', '#inline-twister-expanded-dimension-text-color_name', '#variation_color_name .a-dropdown-prompt', '#native_dropdown_selected_size_name']) {
    const t = clean(doc.querySelector(sel)?.textContent); if (t && !/^select/i.test(t)) return t;
  }
  const lab = clean(doc.querySelector('#variation_color_name label, #variation_color_name .a-form-label')?.textContent);
  const m = lab.match(/Colou?r\s*:\s*(.+)/i);
  if (m) return m[1]!.trim();
  for (const tr of Array.from(doc.querySelectorAll('tr'))) {
    const th = tr.querySelector('th'), td = tr.querySelector('td');
    if (th && td && /^Colou?r$/i.test(clean(th.textContent))) { const t = clean(td.textContent); if (t) return t; }
  }
  return undefined;
}

function brandOf(title: string, byline: string): string {
  const m = byline.match(/Visit the (.+?) Store/i) || byline.match(/Brand:\s*(.+)/i);
  if (m) return m[1]!.trim();
  return title.split(/\s+/)[0] || 'Unknown';
}

export function detectProduct(doc: Document, href: string, opts: { demo?: boolean; fast?: boolean } = {}): DetectResult {
  if (!isProductUrl(href)) return { reason: 'not a product page' };
  let title = (doc.querySelector('#productTitle')?.textContent || '').replace(/\s+/g, ' ').trim();
  if (!title && opts.fast) { // earlier signal: <title> "Amazon.co.uk: <product>: Fashion"
    const parts = (doc.title || '').split(':').map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2 && /^amazon\./i.test(parts[0]!)) title = parts[1]!;
  }
  if (!title) return { reason: 'no title yet' };
  const byline = (doc.querySelector('#bylineInfo')?.textContent || '').replace(/\s+/g, ' ').trim();
  const crumbs = (doc.querySelector('#wayfinding-breadcrumbs_feature_div')?.textContent || '').replace(/\s+/g, ' ');
  const isShoe = SHOE_RE.test(title) || /shoes/i.test(crumbs);
  const isAlcohol = !isShoe && ALCOHOL_RE.test(title);
  if (!isShoe && !isAlcohol) return { reason: 'not a shoe' };
  const brand = brandOf(title, byline);
  let price = readPrice(doc);
  let priceDemo = false;
  if (price === undefined) {
    if (!opts.demo) return { reason: 'no price yet' };
    price = DEMO_PRICE; priceDemo = true;
  }
  const img = (doc.querySelector('#landingImage') as HTMLImageElement | null);
  const image = img?.getAttribute('data-old-hires') || img?.getAttribute('src') || undefined;
  const u = new URL(href);
  const asin = u.pathname.match(ASIN_RE)?.[1]?.toUpperCase();
  const tableAsin = readTableAsin(doc);
  const altAsins = tableAsin && tableAsin !== asin ? [tableAsin] : [];
  const colour = readColour(doc);
  return {
    reason: 'ok',
    product: { title, brand, price, currency: 'GBP', productKind: isAlcohol ? 'alcohol' : 'shoes', url: u.origin + (asin ? '/dp/' + asin : u.pathname), site: u.hostname.replace(/^www\./, ''), image: image || undefined, priceDemo, asin, altAsins, colour },
  };
}
