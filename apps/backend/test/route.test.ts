import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const search = vi.fn();
const parse = vi.fn();

vi.mock('@mendable/firecrawl-js', () => ({
  default: class {
    search = search;
  },
}));
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { parse } };
  },
}));

const { POST } = await import('../app/api/alternatives/route');

const TITLE = "Nike Air Max 90 Men's Trainers (CN8490-002)";
const post = (body: unknown) =>
  POST(new Request('http://localhost/api/alternatives', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  search.mockReset();
  parse.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/alternatives', () => {
  it('rejects bodies that are not { item, price }', async () => {
    expect((await post({ item: TITLE })).status).toBe(400);
    expect((await post({ item: '', price: 10 })).status).toBe(400);
  });

  it('falls back to the cached Nike UK result when keys are missing', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    const res = await post({ item: TITLE, price: 134.99 });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.source).toBe('cache');
    expect(json.alternative).toEqual({
      title: 'Nike Air Max 90 Premium',
      price: 94.49,
      seller: 'Nike UK',
      condition: 'new',
      url: 'https://www.nike.com/gb/w/mens-air-max-90-shoes-auqmoznik1zy7ok',
    });
    expect(json.others[0]).toMatchObject({ seller: 'Foot Locker UK', price: 100 });
    expect(search).not.toHaveBeenCalled();
  });

  it('returns source none for an unknown item with no keys', async () => {
    vi.stubEnv('FIRECRAWL_API_KEY', '');
    const json = await (await post({ item: 'Mystery Lamp', price: 20 })).json();
    expect(json).toEqual({ alternative: null, source: 'none' });
  });

  describe('with keys (mocked Firecrawl + OpenAI)', () => {
    beforeEach(() => {
      vi.stubEnv('FIRECRAWL_API_KEY', 'fc-test');
      vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    });

    it('returns the cheapest valid live match, ignoring wrong model / dearer / non-UK', async () => {
      search.mockResolvedValue({
        web: [
          { url: 'https://www.jdsports.co.uk/product/air-max-90/1/', title: 'Air Max 90', markdown: '£109.99' },
          { url: 'https://www.footlocker.co.uk/en/product/air-max-90/2.html', title: 'Air Max 90', markdown: '£99' },
          { url: 'https://www.nike.com/us/t/air-max-90', title: 'Air Max 90 US', markdown: '$80' },
          { url: 'https://www.sportsdirect.com/nike-air-max-95', title: 'Air Max 95', markdown: '£59' },
          { url: 'https://www.ebay.co.uk/itm/3', title: 'Air Max 90', markdown: '£150' },
        ],
      });
      // The US page is dropped before extraction, so indexes refer to the 4 UK pages.
      parse.mockResolvedValue({
        choices: [
          {
            message: {
              parsed: {
                offers: [
                  { page: 0, title: 'Nike Air Max 90', price: 109.99, seller: 'JD', condition: 'new' },
                  { page: 1, title: 'Nike Air Max 90 CN8490-002', price: 99, seller: 'Foot Locker', condition: 'New' },
                  { page: 2, title: 'Nike Air Max 95', price: 59, seller: 'SD', condition: 'new' },
                  { page: 3, title: 'Nike Air Max 90', price: 150, seller: 'eBay', condition: 'used' },
                  { page: 9, title: 'Nike Air Max 90', price: 50, seller: 'ghost', condition: 'new' },
                ],
              },
            },
          },
        ],
      });

      const json = await (await post({ item: TITLE, price: 134.99 })).json();
      expect(json.source).toBe('live');
      expect(json.alternative).toEqual({
        title: 'Nike Air Max 90 CN8490-002',
        price: 99,
        seller: 'Foot Locker UK',
        condition: 'new',
        url: 'https://www.footlocker.co.uk/en/product/air-max-90/2.html',
      });
      expect(json.others).toEqual([expect.objectContaining({ seller: 'JD Sports', price: 109.99 })]);

      const [query, opts] = search.mock.calls[0]!;
      expect(query).toBe('Nike Air Max 90 CN8490-002');
      expect(opts).toMatchObject({ limit: 5, includeDomains: expect.arrayContaining(['nike.com', 'ebay.co.uk']) });
      // Privacy: nothing but the title/price-derived prompt goes to OpenAI.
      expect(JSON.stringify(parse.mock.calls[0]![0])).not.toMatch(/balance|bill|income/i);
    });

    it('falls back to the cache when Firecrawl errors', async () => {
      search.mockRejectedValue(new Error('boom'));
      const json = await (await post({ item: TITLE, price: 134.99 })).json();
      expect(json.source).toBe('cache');
      expect(json.alternative.price).toBe(94.49);
    });

    it('falls back to the cache when the live search takes too long', async () => {
      const { findAlternative } = await import('../lib/alternatives');
      search.mockImplementation(() => new Promise(() => {}));
      const started = Date.now();
      const r = await findAlternative(TITLE, 134.99, 50);
      expect(Date.now() - started).toBeLessThan(1000);
      expect(r).toMatchObject({ source: 'cache', reason: 'timeout' });
    });
  });
});
