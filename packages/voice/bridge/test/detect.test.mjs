// node packages/voice/bridge/test/detect.test.mjs  (needs linkedom + esbuild from packages/voice)
import { build } from 'esbuild';
import { parseHTML } from 'linkedom';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kh-detect-')), 'detect.mjs');
await build({ entryPoints: [path.join(here, '..', 'src', 'detect.ts')], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { detectProduct, isProductUrl, parseGbp, DEMO_PRICE } = await import(pathToFileURL(out).href);

const URL_NIKE = 'https://www.amazon.co.uk/Nike-Revolution-Running-Black-White/dp/B0DPHTGD5C/ref=sr_1_3?crid=X&keywords=nike';
const doc = (h) => parseHTML(`<!doctype html><html><body>${h}</body></html>`).document;

// likely markup of a UK Nike running shoe page
const withPrice = `
<span id="productTitle">  Nike Revolution 7 Men's Running Shoes
   Black/White </span>
<a id="bylineInfo" href="/stores/Nike">Visit the Nike Store</a>
<img id="landingImage" src="https://m.media-amazon.com/images/I/abc._AC_SX695_.jpg">
<div id="corePrice_feature_div"><span class="a-price" data-a-size="xl"><span class="a-offscreen">£1,024.50</span><span aria-hidden="true"><span class="a-price-symbol">£</span><span class="a-price-whole">1,024<span class="a-price-decimal">.</span></span><span class="a-price-fraction">50</span></span></span>
 <span class="a-price a-text-price"><span class="a-offscreen">£1,500.00</span></span></div>`;
const noPrice = withPrice.replace(/<div id="corePrice_feature_div">[\s\S]*$/, '');

assert.equal(parseGbp('£54.99'), 54.99);
assert.equal(parseGbp(' £1,024.50'), 1024.5);
assert.equal(parseGbp('$5'), undefined);

assert.ok(isProductUrl(URL_NIKE));
assert.ok(isProductUrl('https://www.amazon.co.uk/gp/product/B0DPHTGD5C'));
assert.ok(!isProductUrl('https://www.amazon.co.uk/s?k=nike+running+shoes'));
assert.ok(!isProductUrl('https://www.amazon.co.uk/'));
assert.ok(!isProductUrl('https://example.com/dp/B0DPHTGD5C'));

let r = detectProduct(doc(withPrice), URL_NIKE, { demo: false });
assert.equal(r.reason, 'ok');
assert.equal(r.product.price, 1024.5); // first non-struck price
assert.equal(r.product.brand, 'Nike');
assert.equal(r.product.title, "Nike Revolution 7 Men's Running Shoes Black/White");
assert.equal(r.product.url, 'https://www.amazon.co.uk/dp/B0DPHTGD5C');
assert.equal(r.product.site, 'amazon.co.uk');
assert.match(r.product.image, /media-amazon/);

// price missing: no trigger without demo, trigger with demo
assert.equal(detectProduct(doc(noPrice), URL_NIKE, { demo: false }).reason, 'no price yet');
r = detectProduct(doc(noPrice), URL_NIKE, { demo: true });
assert.equal(r.product.price, DEMO_PRICE);
assert.equal(r.product.priceDemo, true);

// whole/fraction-only fallback
r = detectProduct(doc(noPrice + '<span class="a-price-whole">54<span class="a-price-decimal">.</span></span><span class="a-price-fraction">99</span>'), URL_NIKE);
assert.equal(r.product.price, 54.99);

// negatives
assert.equal(detectProduct(doc(withPrice), 'https://www.amazon.co.uk/s?k=nike', {}).reason, 'not a product page');
// any brand: PUMA (title regex + byline brand)
const URL_PUMA = 'https://www.amazon.co.uk/PUMA-Mens-Axelion-Running-Black-Castlerock/dp/B08KKVTB76/';
r = detectProduct(doc('<span id="productTitle">PUMA Mens Viz Runner Wide Cross-Trainer</span><a id="bylineInfo">Visit the PUMA Store</a><div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">£59.67</span></span></div>'), URL_PUMA);
assert.equal(r.product.brand, 'PUMA'); assert.equal(r.product.price, 59.67); assert.equal(r.product.url, 'https://www.amazon.co.uk/dp/B08KKVTB76');
// shoe only via breadcrumb
r = detectProduct(doc('<div id="wayfinding-breadcrumbs_feature_div"><ul><li>Shoes &amp; Bags</li><li>Mens Shoes</li></ul></div><span id="productTitle">Axelion Mesh</span><a id="bylineInfo">Brand: PUMA</a><span class="a-price"><span class="a-offscreen">£30</span></span>'), URL_PUMA);
assert.equal(r.product.brand, 'PUMA');
assert.equal(detectProduct(doc('<span id="productTitle">Adidas Ultraboost Running Shoes</span>'), URL_NIKE, { demo: true }).product.brand, 'Adidas');
assert.equal(detectProduct(doc('<span id="productTitle">Nike Dri-FIT T-Shirt</span><div id="wayfinding-breadcrumbs_feature_div">Clothing</div>'), URL_NIKE, { demo: true }).reason, 'not a shoe');
assert.equal(detectProduct(doc(''), URL_NIKE, { demo: true }).reason, 'no title yet');
// Nike only in byline, shoe in title
r = detectProduct(doc('<span id="productTitle">Revolution 7 Trainers</span><a id="bylineInfo">Brand: Nike</a><span class="a-price"><span class="a-offscreen">£45.00</span></span>'), URL_NIKE);
assert.equal(r.product.price, 45);

console.log('detect.test.mjs: all assertions passed');
