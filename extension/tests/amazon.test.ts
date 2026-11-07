import { describe, it, expect, afterEach, vi } from 'vitest';
import { installAmazonAdapter, readAmazonPurchase, parsePounds, type AmazonIntent } from '../lib/amazon';
const product = () => {
  document.body.innerHTML = '<h1 id="productTitle">Weekend Running Shoes</h1><input name="ASIN" value="B000TEST01"><div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">£65.00</span></span></div><select id="quantity"><option value="2" selected>2</option></select><input id="add-to-cart-button" type="submit"><button id="buy-now-button"><span>Buy Now</span></button><button id="placeYourOrder">Place order</button>';
};
afterEach(() => { document.body.innerHTML = ''; });
describe('Amazon adapter (DOM fixtures, not live Amazon)', () => {
  it('reads scoped GBP price, quantity, title, ASIN and best-effort category', () => {
    product(); expect(readAmazonPurchase(document, 'basket')).toMatchObject({ id: 'amazon-B000TEST01', title: 'Weekend Running Shoes', price: 130, currency: 'GBP', category: 'clothing' });
    for (const raw of ['£1,299.99', ' £60.00 ']) expect(parsePounds(raw)).toBeGreaterThan(0);
    for (const raw of ['$12.00', '€12', 'not a price', '£0', '£9999999']) expect(parsePounds(raw)).toBe(null);
  });
  it('pauses one attempt, Continue only arms a second manual click, and cannot repeat', () => {
    product(); let intent: AmazonIntent | undefined;
    const adapter = installAmazonAdapter({ document, acceptEvent: () => true, onPurchase(value) { intent = value; } });
    const native = vi.fn(); const button = document.querySelector('#add-to-cart-button')!; button.addEventListener('click', native);
    const first = new MouseEvent('click', { bubbles: true, cancelable: true }); button.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true); expect(native).not.toHaveBeenCalled();
    intent!.continue(); expect(native).not.toHaveBeenCalled();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); expect(native).toHaveBeenCalledTimes(1);
    const third = new MouseEvent('click', { bubbles: true, cancelable: true }); button.dispatchEvent(third);
    expect(third.defaultPrevented).toBe(true); expect(native).toHaveBeenCalledTimes(1);
    adapter.dispose();
  });
  it('never handles synthetic page clicks by default and never touches final-order controls', () => {
    product(); const onPurchase = vi.fn(); const adapter = installAmazonAdapter({ document, onPurchase });
    document.querySelector<HTMLElement>('#buy-now-button')!.click(); expect(onPurchase).not.toHaveBeenCalled(); adapter.dispose();
    const testAdapter = installAmazonAdapter({ document, acceptEvent: () => true, onPurchase });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true }); document.querySelector('#placeYourOrder')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false); expect(onPurchase).not.toHaveBeenCalled(); testAdapter.dispose();
  });
  it('handles replaced nested Buy Now controls with one listener and cleans up', () => {
    product(); const onPurchase = vi.fn(); const adapter = installAmazonAdapter({ document, acceptEvent: () => true, onPurchase });
    document.querySelector('#buy-now-button')!.outerHTML = '<button name="submit.buy-now"><span id="nested">Buy</span></button>';
    document.querySelector('#nested')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onPurchase).toHaveBeenCalledTimes(1); expect(onPurchase.mock.calls[0]![0].control).toBe('buy-now');
    adapter.dispose(); const event = new MouseEvent('click', { bubbles: true, cancelable: true }); document.querySelector('#nested')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false); expect(onPurchase).toHaveBeenCalledTimes(1);
  });
  it('fails open when product data is missing, rather than blocking an unsupported control', () => {
    product(); document.querySelector('#corePrice_feature_div')!.remove();
    const onPurchase = vi.fn(), unavailable = vi.fn(); const adapter = installAmazonAdapter({ document, acceptEvent: () => true, onPurchase, onUnavailable: unavailable });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true }); document.querySelector('#add-to-cart-button')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false); expect(onPurchase).not.toHaveBeenCalled(); expect(unavailable).toHaveBeenCalledOnce(); adapter.dispose();
  });
  it('supports a readable basket subtotal and cancels/expires continuation grants', () => {
    document.body.innerHTML = '<div id="sc-subtotal-amount-activecart"><span class="a-offscreen">£98.00</span></div><input name="proceedToRetailCheckout" type="submit">';
    expect(readAmazonPurchase(document, 'checkout')).toMatchObject({ title: 'Your Amazon basket', price: 98 });
    let intent: AmazonIntent | undefined; let now = 0;
    const adapter = installAmazonAdapter({ document, now: () => now, acceptEvent: () => true, onPurchase(value) { intent = value; } });
    const click = () => { const e = new MouseEvent('click', { bubbles: true, cancelable: true }); document.querySelector('input')!.dispatchEvent(e); return e; };
    click(); intent!.cancel(); expect(click().defaultPrevented).toBe(true);
    intent!.continue(); now = 31000; expect(click().defaultPrevented).toBe(true); adapter.dispose();
  });
});
