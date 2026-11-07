import type { Offer } from './filter';

/**
 * Demo fallback, verified with Firecrawl on the day: used when the live search fails, times out,
 * has no keys or finds nothing. Only for titles that are clearly the Air Max 90.
 */
export const AIR_MAX_90_CACHE: { alternative: Offer; others: Offer[] } = {
  alternative: {
    title: 'Nike Air Max 90 Premium',
    price: 94.49,
    seller: 'Nike UK',
    condition: 'new',
    url: 'https://www.nike.com/gb/w/mens-air-max-90-shoes-auqmoznik1zy7ok',
  },
  others: [
    {
      title: 'Nike Air Max 90',
      price: 100,
      seller: 'Foot Locker UK',
      condition: 'new',
      // A search URL on purpose: we don't invent product URLs.
      url: 'https://www.footlocker.co.uk/en/search?query=nike%20air%20max%2090',
    },
  ],
};

export function cachedFor(title: string, price: number): { alternative: Offer; others: Offer[] } | null {
  if (!/air\s*max\s*90/i.test(title)) return null;
  // Only meaningful if it's actually cheaper than what they're looking at.
  if (!(AIR_MAX_90_CACHE.alternative.price < price)) return null;
  return { alternative: AIR_MAX_90_CACHE.alternative, others: AIR_MAX_90_CACHE.others.filter((o) => o.price < price) };
}
