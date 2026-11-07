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

// ---- four demo pages: real-world-like markup ----
const pageHtml = (o) => `<span id="productTitle"> ${o.title} </span><a id="bylineInfo">${o.byline}</a>
<img id="landingImage" src="https://m.media-amazon.com/images/I/x.jpg">
<div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">${o.price}</span></span></div>
<div id="variation_color_name"><label class="a-form-label">Colour: <span class="selection">${o.colour}</span></label></div>
<table id="productDetails_detailBullets_sections1"><tr><th> ASIN </th><td>&#8206;${o.tableAsin}</td></tr></table>`;
const pages = [
  { u: 'https://www.amazon.co.uk/Brooks-Glycerin-Running-Trainers-Mens/dp/B0DXXBROOK/ref=x', title: 'Brooks Glycerin 22 Running Trainers Mens Road Shoes', byline: 'Brand: Brooks', price: '£184.00', colour: 'Burnt Sienna Ebony Orange', tableAsin: 'B0DXXBROO2', brand: 'Brooks', p: 184, asin: 'B0DXXBROOK' },
  { u: 'https://www.amazon.co.uk/FitVille-Wide-Running-Shoes/dp/B0CFITVILE', title: 'FitVille Mens Wide Running Shoes Road Trainers', byline: 'Visit the FitVille Store', price: '£49.99', colour: 'Black', tableAsin: 'B0CFITVILE', brand: 'FitVille', p: 49.99, asin: 'B0CFITVILE' },
  { u: 'https://www.amazon.co.uk/PUMA-Viz-Runner/dp/B07PUMAVIZ', title: 'PUMA Mens Viz Runner Wide Cross-Trainer', byline: 'Visit the PUMA Store', price: '£59.67', colour: 'Red', tableAsin: 'B07PUMAVIZ', brand: 'PUMA', p: 59.67, asin: 'B07PUMAVIZ' },
  { u: 'https://www.amazon.co.uk/Nike-Revolution-8/dp/B0NIKEREV8', title: 'Nike Mens Revolution 8 Road Running Shoes', byline: 'Visit the Nike Store', price: '£54.95', colour: 'Black/White', tableAsin: 'B0NIKEREV8', brand: 'Nike', p: 54.95, asin: 'B0NIKEREV8' },
];
for (const g of pages) {
  const x = detectProduct(doc(pageHtml(g)), g.u).product;
  assert.ok(x, g.title);
  assert.equal(x.brand, g.brand); assert.equal(x.price, g.p); assert.equal(x.asin, g.asin); assert.equal(x.colour, g.colour);
  assert.equal(x.title, g.title);
  assert.deepEqual(x.altAsins, g.tableAsin === g.asin ? [] : [g.tableAsin]);
  assert.match(x.image, /media-amazon/);
}
// bullet-list ASIN + no colour
const b = detectProduct(doc('<span id="productTitle">Brooks Ghost Running Shoes</span><a id="bylineInfo">Brand: Brooks</a><span class="a-price"><span class="a-offscreen">£100</span></span><div id="detailBullets_feature_div"><ul><li><span>ASIN &#8207; : &#8206; B0BULLET11</span></li></ul></div>'), 'https://www.amazon.co.uk/x/dp/B0BULLET00').product;
assert.deepEqual(b.altAsins, ['B0BULLET11']); assert.equal(b.colour, undefined);

console.log('detect.test.mjs: all assertions passed');
