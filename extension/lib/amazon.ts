import type { PurchaseDetails } from './contracts';

export type AmazonControl = 'basket' | 'buy-now' | 'checkout';
export interface AmazonIntent {
  item: PurchaseDetails;
  control: AmazonControl;
  label: string;
  continue: () => void;
  cancel: () => void;
}
const selectors = [
  '#add-to-cart-button', '[name="submit.add-to-cart"]',
  '#buy-now-button', '[name="submit.buy-now"]',
  '[name="proceedToRetailCheckout"]',
].join(',');

export function parsePounds(text: string | null | undefined): number | null {
  if (!text || /[$€]/.test(text)) return null;
  const match = text.replace(/\s/g, '').match(/£([\d,]+(?:\.\d{1,2})?)/);
  const value = match ? Number(match[1]!.replaceAll(',', '')) : NaN;
  return Number.isFinite(value) && value > 0 && value <= 100000 ? value : null;
}
export function readAmazonPurchase(doc: Document, control: AmazonControl): PurchaseDetails | null {
  const basket = control === 'checkout';
  const title = basket ? 'Your Amazon basket' : doc.querySelector('#productTitle, #title_feature_div h1')?.textContent?.trim().replace(/\s+/g, ' ');
  const priceSelectors = basket ? ['#sc-subtotal-amount-activecart .a-offscreen', '#sc-subtotal-amount-activecart'] : [
    '#corePrice_feature_div .a-price:not(.a-text-price) .a-offscreen',
    '#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen',
    '#apex_desktop .a-price:not(.a-text-price) .a-offscreen',
    '#price_inside_buybox', '#priceblock_ourprice', '#priceblock_dealprice',
  ];
  let price: number | null = null;
  for (const selector of priceSelectors) {
    price = parsePounds(doc.querySelector(selector)?.textContent);
    if (price !== null) break;
  }
  if (!title || price === null) return null;
  const rawQuantity = Number((doc.querySelector('#quantity') as HTMLSelectElement | null)?.value ?? 1);
  const quantity = !basket && Number.isInteger(rawQuantity) && rawQuantity >= 1 && rawQuantity <= 99 ? rawQuantity : 1;
  const total = Math.round(price * quantity * 100) / 100;
  if (total > 100000) return null;
  const categoryText = `${doc.querySelector('#wayfinding-breadcrumbs_feature_div')?.textContent ?? ''} ${title}`.toLowerCase();
  const category = /\b(wine|beer|alcohol|whisky|vodka|gin|rum|spirits)\b/.test(categoryText) ? 'alcohol'
    : /\b(shoes|trainers|clothing|apparel|shirt|dress|fashion)\b/.test(categoryText) ? 'clothing'
      : /\b(notebook|stationery|pencils|pens)\b/.test(categoryText) ? 'stationery' : 'electronics';
  const asin = (doc.querySelector('input[name="ASIN"], #ASIN') as HTMLInputElement | null)?.value
    || doc.location?.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1] || 'product';
  return { id: `amazon-${basket ? 'basket' : asin}`, title: title.slice(0, 120), price: total, currency: 'GBP', category };
}

/** One delegated capture listener covers dynamically replaced Amazon controls.
 * Final-order/payment controls are deliberately absent from the selector list.
 * Continue arms exactly one *trusted human click*, never a synthetic .click(). */
export function installAmazonAdapter(options: {
  document: Document;
  onPurchase: (intent: AmazonIntent) => void;
  onUnavailable?: () => void;
  acceptEvent?: (event: MouseEvent) => boolean;
  now?: () => number;
}) {
  const doc = options.document;
  const allowed = new Map<string, number>();
  const now = options.now ?? Date.now;
  const handle = (event: MouseEvent) => {
    if (!(options.acceptEvent?.(event) ?? event.isTrusted) || event.defaultPrevented || event.button !== 0) return;
    // composedPath is essential: clicks inside the extension's own shadow UI
    // must never be interpreted as Amazon interactions.
    const target = event.composedPath()[0];
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>(selectors);
    if (!button || button.closest('pocket-companion') || button.hasAttribute('disabled') || button.getAttribute('aria-disabled') === 'true') return;
    const control: AmazonControl = button.matches('#buy-now-button,[name="submit.buy-now"]') ? 'buy-now'
      : button.matches('[name="proceedToRetailCheckout"]') ? 'checkout' : 'basket';
    const item = readAmazonPurchase(doc, control);
    if (!item) { options.onUnavailable?.(); return; }
    const key = `${doc.location?.pathname}|${control}|${item.id}|${item.price}`;
    for (const [entry, expiry] of allowed) if (expiry < now()) allowed.delete(entry);
    const expiry = allowed.get(key);
    if (expiry !== undefined) {
      allowed.delete(key);
      if (expiry >= now()) return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const label = control === 'basket' ? 'Add to Basket' : control === 'buy-now' ? 'Buy Now' : 'Proceed to checkout';
    let active = true;
    options.onPurchase({ item, control, label,
      continue() { if (!active) return; active = false; allowed.set(key, now() + 30000); if (button.isConnected) button.focus(); },
      cancel() { if (!active) return; active = false; allowed.delete(key); },
    });
  };
  doc.addEventListener('click', handle, true);
  return { dispose() { doc.removeEventListener('click', handle, true); allowed.clear(); } };
}
