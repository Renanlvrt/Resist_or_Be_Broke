// Run: cd backend && npx tsx --test src/routes/search.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import search, {
  acceptLine,
  buildQuery,
  cachedResult,
  isSameModel,
  modelName,
  pickCheapest,
  productCode,
  retailerFor,
  templateLine,
} from './search.js';

const demo = { title: 'Nike Pegasus 41 Running Shoes', brand: 'Nike', price: 119.99, currency: 'GBP', url: 'https://www.amazon.co.uk/dp/DEMO', site: 'amazon.co.uk' };

test('model name and query strip noise but keep model + code', () => {
  assert.equal(modelName(demo), 'Nike Pegasus 41');
  const am = { title: "Nike Air Max 90 Men's Trainers (CN8490-002)", brand: 'Nike' };
  assert.equal(productCode(am.title), 'CN8490-002');
  assert.equal(modelName(am), 'Nike Air Max 90');
  assert.equal(buildQuery(am), 'Nike Air Max 90 CN8490-002');
  assert.equal(modelName({ title: 'Pegasus 41 Road Running Shoes', brand: 'Nike' }), 'Nike Pegasus 41');
});

test('retailer allow-list: UK only, nike.com only under /gb', () => {
  assert.equal(retailerFor('https://www.nike.com/gb/t/pegasus-41'), 'Nike UK');
  assert.equal(retailerFor('https://www.nike.com/us/t/pegasus-41'), null);
  assert.equal(retailerFor('https://www.sportsshoes.com/product/nike/pegasus-41'), 'SportsShoes');
  assert.equal(retailerFor('https://www.ebay.co.uk/itm/123'), 'eBay UK');
  assert.equal(retailerFor('https://www.ebay.com/itm/123'), null);
  assert.equal(retailerFor('https://evil.example/jdsports.co.uk'), null);
  assert.equal(retailerFor('not a url'), null);
});

test('same model: version numbers and codes must match', () => {
  assert.ok(isSameModel('Nike Pegasus 41 Men\'s Road Running Shoes', 'Nike Pegasus 41', null));
  assert.ok(!isSameModel('Nike Pegasus 40 Running Shoes', 'Nike Pegasus 41', null));
  assert.ok(!isSameModel('Nike Pegasus 410', 'Nike Pegasus 41', null));
  assert.ok(!isSameModel('Nike Air Max 90 (DH8010-100)', 'Nike Air Max 90', 'CN8490-002'));
  assert.ok(isSameModel('Nike Air Max 90 (CN8490-002)', 'Nike Air Max 90', 'CN8490-002'));
  // real Firecrawl results for "Nike Pegasus 41" included these variants
  assert.ok(!isSameModel('Nike Air Zoom Pegasus 41 GORE-TEX Running Shoes', 'Nike Pegasus 41', null, 'Nike Pegasus 41 Running Shoes'));
  assert.ok(!isSameModel('Nike Pegasus 41 By You Custom Road Running Shoes (Wide)', 'Nike Pegasus 41', null, 'Nike Pegasus 41 Running Shoes'));
  assert.ok(isSameModel('Nike | Pegasus 41 Road Running Shoes Mens - Sports Direct', 'Nike Pegasus 41', null, 'Nike Pegasus 41 Running Shoes'));
  assert.ok(isSameModel('Nike Pegasus 41 GORE-TEX', 'Nike Pegasus 41', null, 'Nike Pegasus 41 GORE-TEX Running Shoes'));
});

test('pickCheapest keeps same-model, cheaper, UK offers and drops junk prices', () => {
  const offers = [
    { title: 'Nike Pegasus 41', price: 104.99, url: 'https://www.jdsports.co.uk/p/1', retailer: 'JD Sports' },
    { title: 'Nike Pegasus 41', price: 99.99, url: 'https://www.sportsshoes.com/p/2', retailer: 'SportsShoes' },
    { title: 'Nike Pegasus 40', price: 69.99, url: 'https://www.sportsdirect.com/p/3', retailer: 'Sports Direct' },
    { title: 'Nike Pegasus 41', price: 89.99, url: 'https://www.nike.com/us/p/4', retailer: 'Nike US' },
    { title: 'Nike Pegasus 41 laces', price: 5, url: 'https://www.ebay.co.uk/itm/5', retailer: 'eBay UK' },
    { title: 'Nike Pegasus 41', price: 129.99, url: 'https://www.footlocker.co.uk/p/6', retailer: 'Foot Locker UK' },
  ];
  assert.equal(pickCheapest(offers, demo)?.url, 'https://www.sportsshoes.com/p/2');
  assert.equal(pickCheapest(offers.slice(2), demo), null);
});

test('spoken line: template and Claude-line validation', () => {
  assert.equal(templateLine('Nike Pegasus 41', 20, 'SportsShoes'), 'If you really need them, the exact same Nike Pegasus 41 is £20 cheaper at SportsShoes.');
  assert.ok(acceptLine('Same Pegasus 41, £20 cheaper at SportsShoes.', 20, 99.99));
  assert.ok(!acceptLine('Great shoes, buy them!', 20, 99.99));
  assert.ok(!acceptLine('', 20, 99.99));
});

async function withServer(fn: (base: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use('/api/search', search);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/search`;
  try {
    await fn(base);
  } finally {
    server.closeAllConnections();
    server.close();
  }
}
const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('route: ?demo=1 returns the cached JSON unchanged; bad body is 400', async () => {
  await withServer(async (base) => {
    assert.deepEqual(await (await post(`${base}?demo=1`, {})).json(), cachedResult());
    assert.equal((await post(base, { nope: true })).status, 400);
  });
});

test('route: no keys -> cache for the demo product, not found for others', async () => {
  const saved = { f: process.env.FIRECRAWL_API_KEY, a: process.env.ANTHROPIC_API_KEY };
  delete process.env.FIRECRAWL_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    await withServer(async (base) => {
      const r = await (await post(base, { product: demo })).json();
      assert.deepEqual(r, cachedResult());
      const other = await (await post(base, { product: { ...demo, title: 'Casio FX-83GTX Calculator', brand: 'Casio', price: 11.99 } })).json();
      assert.equal(other.found, false);
      assert.equal(other.cached, false);
    });
  } finally {
    if (saved.f) process.env.FIRECRAWL_API_KEY = saved.f;
    if (saved.a) process.env.ANTHROPIC_API_KEY = saved.a;
  }
});

test('route: live path (mocked Firecrawl + Claude) returns the cheapest valid match', async () => {
  process.env.FIRECRAWL_API_KEY = 'test';
  process.env.ANTHROPIC_API_KEY = 'test';
  const realFetch = globalThis.fetch;
  const seen: { firecrawl?: any; claude?: any } = {};
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://api.firecrawl.dev/v2/search')) {
      seen.firecrawl = JSON.parse(init.body);
      return Response.json({
        success: true,
        data: {
          web: [
            { url: 'https://www.jdsports.co.uk/product/pegasus-41/1', title: 'Nike Pegasus 41 | JD Sports', markdown: 'Nike Pegasus 41 £104.99' },
            { url: 'https://www.sportsshoes.com/product/nike/pegasus-41/2', title: 'Nike Pegasus 41 | SportsShoes', markdown: 'Nike Pegasus 41 now £99.99 was £119.99' },
            { url: 'https://www.nike.com/us/t/pegasus-41', title: 'Nike Pegasus 41 US', markdown: '$90' },
          ],
        },
      });
    }
    if (url.startsWith('https://api.anthropic.com/v1/messages')) {
      seen.claude = JSON.parse(init.body);
      const text = JSON.stringify({
        offers: [
          { page: 0, title: 'Nike Pegasus 41', price: 104.99 },
          { page: 1, title: 'Nike Pegasus 41', price: 99.99 },
        ],
        best: 1,
        spokenLine: 'Same Pegasus 41 is £20 cheaper at SportsShoes.',
      });
      return Response.json({ content: [{ type: 'text', text }] });
    }
    return realFetch(input, init);
  }) as typeof fetch;
  try {
    await withServer(async (base) => {
      const r = await (await post(base, { product: demo })).json();
      assert.equal(r.found, true);
      assert.equal(r.cached, false);
      assert.equal(r.alternative.price, 99.99);
      assert.equal(r.alternative.retailer, 'SportsShoes');
      assert.equal(r.alternative.url, 'https://www.sportsshoes.com/product/nike/pegasus-41/2');
      assert.equal(r.savings, 20);
      assert.equal(r.spokenLine, 'Same Pegasus 41 is £20 cheaper at SportsShoes.');
    });
    assert.equal(seen.firecrawl.query, 'Nike Pegasus 41');
    assert.equal(seen.firecrawl.country, 'GB');
    assert.ok(seen.firecrawl.includeDomains.includes('sportsshoes.com'));
    // privacy: Claude sees the product and page text only, never a budget/profile
    assert.ok(!JSON.stringify(seen.claude).match(/monthlyBudget|savedByKeepHard|categories/));
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.FIRECRAWL_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  }
});
