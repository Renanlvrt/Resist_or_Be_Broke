import { describe, expect, it } from 'vitest';
import { cachedFor } from '../lib/alternatives/cache';
import { filterOffers, isSameModel, pickCheapest, ukRetailer, type Offer } from '../lib/alternatives/filter';
import { buildQuery, parseModel } from '../lib/alternatives/query';

const TITLE = "Nike Air Max 90 Men's Trainers (CN8490-002)";
const PRICE = 134.99;

const offer = (o: Partial<Offer>): Offer => ({
  title: 'Nike Air Max 90',
  price: 100,
  seller: 'x',
  condition: 'new',
  url: 'https://www.footlocker.co.uk/en/product/nike-air-max-90/314100.html',
  ...o,
});

describe('buildQuery / parseModel', () => {
  it('keeps brand, model and style code, drops listing noise', () => {
    expect(buildQuery(TITLE)).toBe('Nike Air Max 90 CN8490-002');
    expect(parseModel(TITLE)).toEqual({ brand: 'Nike', model: 'Air Max 90', name: 'Nike Air Max 90', code: 'CN8490-002' });
  });

  it('handles Amazon-style titles with colour/size after a comma and curly apostrophes', () => {
    expect(buildQuery('Nike Men’s Air Max 90 Trainers, Black/White, 9 UK')).toBe('Nike Air Max 90');
    expect(buildQuery('Nike Air Max 90 - Mens Shoes CN8490-002')).toBe('Nike Air Max 90 CN8490-002');
  });

  it('works without a code', () => {
    expect(parseModel('adidas Samba OG Shoes')).toMatchObject({ name: 'adidas Samba OG', code: null });
  });
});

describe('ukRetailer', () => {
  it('accepts allow-listed UK hosts and subdomains', () => {
    expect(ukRetailer('https://www.nike.com/gb/t/air-max-90-shoes')?.label).toBe('Nike UK');
    expect(ukRetailer('https://www.jdsports.co.uk/product/x/123/')?.label).toBe('JD Sports');
    expect(ukRetailer('https://www.ebay.co.uk/itm/123')?.label).toBe('eBay UK');
    expect(ukRetailer('https://www.sportsdirect.com/nike-air-max-90')?.label).toBe('Sports Direct');
  });

  it('rejects non-UK stores and lookalike hosts', () => {
    expect(ukRetailer('https://www.nike.com/us/t/air-max-90')).toBeNull();
    expect(ukRetailer('https://www.nike.com/gbx/t/air-max-90')).toBeNull();
    expect(ukRetailer('https://www.ebay.com/itm/123')).toBeNull();
    expect(ukRetailer('https://footlocker.co.uk.evil.com/x')).toBeNull();
    expect(ukRetailer('https://notfootlocker.co.uk/x')).toBeNull();
    expect(ukRetailer('not a url')).toBeNull();
  });
});

describe('isSameModel', () => {
  const m = parseModel(TITLE);
  it('matches the model, including variants like Premium', () => {
    expect(isSameModel('Nike Air Max 90 Premium', m)).toBe(true);
    expect(isSameModel("Nike Air Max 90 Men's Shoes CN8490-002", m)).toBe(true);
  });
  it('rejects other models and other style codes', () => {
    expect(isSameModel('Nike Air Max 95', m)).toBe(false);
    expect(isSameModel('Nike Air Max 900', m)).toBe(false);
    expect(isSameModel('Nike Air Force 1', m)).toBe(false);
    expect(isSameModel('Nike Air Max 90 DD1391-100', m)).toBe(false);
  });
});

describe('filterOffers + pickCheapest', () => {
  it('rejects wrong model, not cheaper, non-UK host; picks the cheapest valid one', () => {
    const offers = [
      offer({ title: 'Nike Air Max 95', price: 60 }), // wrong model
      offer({ title: 'Nike Air Max 90', price: 134.99 }), // not cheaper
      offer({ title: 'Nike Air Max 90', price: 140 }), // dearer
      offer({ title: 'Nike Air Max 90', price: 70, url: 'https://www.nike.com/us/t/air-max-90' }), // US store
      offer({ title: 'Nike Air Max 90', price: 65, url: 'https://www.amazon.com/dp/B0' }), // not allow-listed
      offer({ title: 'Nike Air Max 90 laces', price: 5 }), // implausibly cheap
      offer({ title: 'Nike Air Max 90 Premium', price: 94.49, url: 'https://www.nike.com/gb/t/air-max-90-premium' }),
      offer({ title: 'Nike Air Max 90', price: 100 }),
    ];
    const kept = filterOffers(offers, TITLE, PRICE);
    expect(kept.map((o) => [o.seller, o.price])).toEqual([
      ['Nike UK', 94.49],
      ['Foot Locker UK', 100],
    ]);
    expect(pickCheapest(kept)).toMatchObject({ seller: 'Nike UK', price: 94.49 });
  });

  it('returns null when nothing qualifies', () => {
    expect(pickCheapest(filterOffers([offer({ price: 200 })], TITLE, PRICE))).toBeNull();
  });
});

describe('cachedFor', () => {
  it('only serves Air Max 90 titles, and only when cheaper', () => {
    expect(cachedFor(TITLE, PRICE)?.alternative).toMatchObject({ seller: 'Nike UK', price: 94.49 });
    expect(cachedFor('Nike Air Force 1', 99)).toBeNull();
    expect(cachedFor(TITLE, 90)).toBeNull();
  });
});
