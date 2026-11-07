/**
 * Site adapters. The mock shop deliberately uses amazon.co.uk's IDs, so one adapter reads both.
 * Intercepts Buy Now / Add to basket in the capture phase; "proceed" replays the original click.
 */
export interface Product {
  item: string;
  price: number;
  qty: number;
  site: string;
}

export type BuyKind = 'buy_now' | 'add_to_basket';

const BUTTONS: Record<BuyKind, string> = {
  buy_now: '#buy-now-button, input[name="submit.buy-now"], #submit\\.buy-now',
  add_to_basket: '#add-to-cart-button, input[name="submit.add-to-cart"], #submit\\.add-to-cart',
};

const TITLE = ['#productTitle', '#title'];
const PRICE = [
  '#corePrice_feature_div .a-price .a-offscreen',
  '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
  '#apex_desktop .a-price .a-offscreen',
  '#price_inside_buybox',
  '#priceblock_ourprice',
  '#priceblock_dealprice',
  '.a-price .a-offscreen',
];
const QTY = ['#quantity', 'select[name="quantity"]'];

function firstText(doc: Document, sels: string[]): string | null {
  for (const s of sels) {
    const t = doc.querySelector(s)?.textContent?.trim();
    if (t) return t;
  }
  return null;
}

export function parsePrice(text: string): number | null {
  const m = text.replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/);
  return m ? Number(m[1]) : null;
}

export function siteName(host: string): string {
  if (host.endsWith('amazon.co.uk')) return 'amazon.co.uk';
  return 'mock-shop';
}

export function readProduct(doc: Document = document): Product | null {
  const item = firstText(doc, TITLE);
  const priceText = firstText(doc, PRICE);
  const price = priceText ? parsePrice(priceText) : null;
  if (!item || price === null) return null;
  const qtyEl = QTY.map((s) => doc.querySelector<HTMLSelectElement | HTMLInputElement>(s)).find(Boolean);
  const qty = Math.max(1, Number(qtyEl?.value ?? 1) || 1);
  return { item: item.replace(/\s+/g, ' '), price, qty, site: siteName(location.hostname) };
}

const BYPASS = 'robBypass';

export function installInterceptor(onBuy: (p: Product, proceed: () => void, kind: BuyKind) => void): () => void {
  const handler = (ev: MouseEvent) => {
    const target = ev.target as Element | null;
    if (!target?.closest) return;
    for (const kind of Object.keys(BUTTONS) as BuyKind[]) {
      const el = target.closest<HTMLElement>(BUTTONS[kind]);
      if (!el) continue;
      if (el.dataset[BYPASS] === '1') {
        delete el.dataset[BYPASS];
        return; // replayed click: let the shop handle it
      }
      const product = readProduct();
      if (!product) return; // can't read the page: never get in the way
      ev.preventDefault();
      ev.stopImmediatePropagation();
      const proceed = () => {
        el.dataset[BYPASS] = '1';
        el.click();
      };
      onBuy(product, proceed, kind);
      return;
    }
  };
  document.addEventListener('click', handler, true);
  return () => document.removeEventListener('click', handler, true);
}
