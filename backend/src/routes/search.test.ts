// Run: cd backend && npx tsx --test src/routes/search.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import search, {
  acceptLine,
  buildQuery,
  clearMemo,
  curatedFor,
  cleanTitle,
  firstPrice,
  isListingPage,
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

test('route: demo ASIN -> verified alternative instantly (demo or live)', async () => {
  await withServer(async (base) => {
    const nike = { ...demo, title: "Nike Revolution Men's Running Shoes", price: 64.99, url: 'https://www.amazon.co.uk/dp/B0DPHTGD5C?th=1' };
    for (const q of ['', '?demo=1']) {
      const r: any = await (await post(base + q, { product: nike })).json();
      assert.equal(r.cached, true);
      assert.ok(r.alternative.price < nike.price);
      assert.deepEqual(r, curatedFor(nike));
    }
    // the spoken reason reaches B's colour-aware lookup
    const red: any = await (await post(base, { product: nike, reasonText: 'I want the red ones' })).json();
    assert.deepEqual(red, curatedFor(nike, 'I want the red ones'));
  });
});

test('route: ?demo=1, missing keys or a product without price -> found:false (no invented saving), never 400', async () => {
  const saved = { f: process.env.FIRECRAWL_API_KEY, a: process.env.ANTHROPIC_API_KEY };
  delete process.env.FIRECRAWL_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  clearMemo();
  try {
    await withServer(async (base) => {
      for (const [q, body] of [
        ['?demo=1', { product: demo }],
        ['', { product: demo }],
        ['', { product: { title: 'Nike Pegasus 41', brand: 'Nike' } }], // price not rendered yet
        ['', {}],
      ] as const) {
        const res = await post(base + q, body);
        assert.equal(res.status, 200);
        const r = await res.json();
        assert.equal(r.found, false); // never invent a price or saving
        assert.equal(r.savings, 0);
      }
    });
  } finally {
    if (saved.f) process.env.FIRECRAWL_API_KEY = saved.f;
    if (saved.a) process.env.ANTHROPIC_API_KEY = saved.a;
  }
});

// Mock of Firecrawl (search -> titles only, scrape -> markdown) and, optionally, Claude.
function mockApis(claude: 'ok' | 'fail') {
  clearMemo();
  const realFetch = globalThis.fetch;
  let searches = 0;
  const seen: { search?: any; scraped: string[]; claude?: any } = { scraped: [] };
  const pages: Record<string, string> = {
    'https://www.sportsdirect.com/nike-pegasus-41-road-running-shoes-mens-210014': '# Nike Pegasus 41\n£69.00\nWas £129.99',
    'https://www.jdsports.co.uk/product/nike-pegasus-41/1': '# Nike Pegasus 41\n£104.99',
  };
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === 'https://api.firecrawl.dev/v2/search') {
      searches++;
      seen.search = JSON.parse(init.body);
      return Response.json({
        success: true,
        data: {
          web: [
            { url: 'https://www.nike.com/gb/t/pegasus-41-by-you-custom-road-running-shoes-dzzPLS', title: 'Nike Pegasus 41 By You Custom Road Running Shoes (Wide)' },
            { url: 'https://www.sportsdirect.com/nike-pegasus-41-road-running-shoes-mens-210014', title: 'Nike | Pegasus 41 Road Running Shoes Mens - Sports Direct' },
            { url: 'https://www.sportsshoes.com/product/nik23480/nike-air-zoom-pegasus-41-gore-tex-running-shoes', title: 'Nike Air Zoom Pegasus 41 GORE-TEX Running Shoes' },
            { url: 'https://www.nike.com/gb/w/pegasus-running-shoes-37v7jz8nexhzy7ok', title: 'Pegasus Running Shoes & Trainers - Nike' },
            { url: 'https://www.jdsports.co.uk/product/nike-pegasus-41/1', title: 'Nike Pegasus 41 | JD Sports' },
          ],
        },
      });
    }
    if (url === 'https://api.firecrawl.dev/v2/scrape') {
      const { url: page } = JSON.parse(init.body);
      seen.scraped.push(page);
      return Response.json({ success: true, data: { markdown: pages[page] ?? '' } });
    }
    if (url.startsWith('https://api.anthropic.com/v1/messages')) {
      seen.claude = JSON.parse(init.body);
      if (claude === 'fail') return new Response('{}', { status: 401 });
      const sd = seen.claude.messages[0].content.includes('page 0: Sports Direct') ? 0 : 1;
      const text = JSON.stringify({
        offers: [
          { page: sd, title: 'Nike Pegasus 41 Road Running Shoes Mens', price: 69 },
          { page: 1 - sd, title: 'Nike Pegasus 41', price: 104.99 },
        ],
        best: sd,
        spokenLine: 'Same Pegasus 41 is £50.99 cheaper at Sports Direct.',
      });
      return Response.json({ content: [{ type: 'text', text }] });
    }
    return realFetch(input, init);
  }) as typeof fetch;
  process.env.FIRECRAWL_API_KEY = 'test';
  process.env.ANTHROPIC_API_KEY = 'test';
  return {
    seen,
    searches: () => searches,
    restore() {
      globalThis.fetch = realFetch;
      delete process.env.FIRECRAWL_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
    },
  };
}

test('price parser and title cleanup', () => {
  assert.equal(firstPrice('# Nike Pegasus 41\n£69.00\nWas £129.99'), 69);
  assert.equal(firstPrice('Delivery £0 · now £1,049.99'), 1049.99);
  assert.equal(firstPrice('no price here'), null);
  // real Firecrawl results for "Nike Air Max 90" were all listings: the parser must skip them
  assert.ok(isListingPage('https://www.nike.com/gb/w/mens-air-max-90-shoes-auqmoznik1zy7ok'));
  assert.ok(isListingPage('https://www.jdsports.co.uk/collection/nike-air-max-90/'));
  assert.ok(isListingPage('https://www.sportsdirect.com/nike/nike-footwear/nike-trainers/nike-air-max-90'));
  assert.ok(!isListingPage('https://www.sportsdirect.com/nike-pegasus-41-road-running-shoes-mens-210014'));
  assert.ok(!isListingPage('https://www.jdsports.co.uk/product/nike-pegasus-41/1'));
  assert.equal(cleanTitle('Nike | Pegasus 41 Road Running Shoes Mens - Sports Direct'), 'Nike Pegasus 41 Road Running Shoes Mens');
});

test('route: live path scrapes only same-model candidates; Claude picks the cheapest', async () => {
  const m = mockApis('ok');
  try {
    await withServer(async (base) => {
      const r = await (await post(base, { product: demo })).json();
      assert.equal(r.found, true);
      assert.equal(r.cached, false);
      assert.equal(r.alternative.price, 69);
      assert.equal(r.alternative.retailer, 'Sports Direct');
      assert.equal(r.alternative.url, 'https://www.sportsdirect.com/nike-pegasus-41-road-running-shoes-mens-210014');
      assert.equal(r.savings, 50.99);
      assert.equal(r.spokenLine, 'Same Pegasus 41 is £50.99 cheaper at Sports Direct.');
    });
    assert.equal(m.seen.search.query, 'Nike Pegasus 41');
    assert.equal(m.seen.search.country, 'GB');
    assert.equal(m.seen.search.scrapeOptions, undefined, 'search must not scrape (17 s cold)');
    // By You, GORE-TEX and the category page are never scraped
    assert.deepEqual(m.seen.scraped.sort(), [
      'https://www.jdsports.co.uk/product/nike-pegasus-41/1',
      'https://www.sportsdirect.com/nike-pegasus-41-road-running-shoes-mens-210014',
    ]);
    // privacy: Claude sees the product and page text only, never a budget/profile
    assert.ok(!JSON.stringify(m.seen.claude).match(/monthlyBudget|savedByKeepHard|categories/));
  } finally {
    m.restore();
  }
});

test('route: Claude down -> price parser still finds the live match, template line', async () => {
  const m = mockApis('fail');
  try {
    await withServer(async (base) => {
      const r = await (await post(base, { product: demo })).json();
      assert.equal(r.cached, false);
      assert.equal(r.alternative.price, 69);
      assert.equal(r.alternative.title, 'Nike Pegasus 41 Road Running Shoes Mens');
      assert.equal(r.spokenLine, 'If you really need them, the exact same Nike Pegasus 41 is £50.99 cheaper at Sports Direct.');
    });
  } finally {
    m.restore();
  }
});

test('route: ?prefetch=1 returns 202 at once; the real call reuses the same search', async () => {
  const m = mockApis('ok');
  try {
    await withServer(async (base) => {
      const pre = await post(base + '?prefetch=1', { product: demo });
      assert.equal(pre.status, 202);
      assert.deepEqual(await pre.json(), { prefetching: true });
      const t = Date.now();
      const r = await (await post(base, { product: demo })).json();
      assert.equal(r.alternative.price, 69);
      assert.ok(Date.now() - t < 1000);
      const again = await (await post(base, { product: demo })).json();
      assert.equal(again.alternative.price, 69);
    });
    assert.equal(m.searches(), 1, 'prefetch + 2 calls = one Firecrawl search');
  } finally {
    m.restore();
  }
});

test('memo: "nothing cheaper" is remembered, errors are retried', async () => {
  const m = mockApis('ok');
  try {
    await withServer(async (base) => {
      const cheap = { ...demo, price: 60 }; // every offer is dearer -> nothing cheaper
      await post(base, { product: cheap });
      await post(base, { product: cheap });
      assert.equal(m.searches(), 1);
    });
  } finally {
    m.restore();
  }
  const realFetch = globalThis.fetch;
  let calls = 0;
  process.env.FIRECRAWL_API_KEY = 'test';
  clearMemo();
  try {
    await withServer(async (base) => {
      // Firecrawl answers 429; the test server itself is still reached through the real fetch
      globalThis.fetch = (async (input: any, init?: any) => {
        if (String(input).startsWith('http://127.0.0.1')) return realFetch(input, init);
        calls++;
        return new Response('rate limited', { status: 429 });
      }) as typeof fetch;
      await post(base, { product: demo });
      await post(base, { product: demo });
    });
    assert.equal(calls, 2, 'a Firecrawl 429 must not be cached');
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.FIRECRAWL_API_KEY;
  }
});
