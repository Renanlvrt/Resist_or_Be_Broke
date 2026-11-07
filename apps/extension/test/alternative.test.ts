import { AISHA, DEMO_PRICES, DEMO_TODAY, decide, withAlternative, type PurchaseRequest } from '@resist/engine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { alternativeCopy } from '../src/content/components/AlternativeCard';
import { OFFLINE_AIR_MAX_90, fetchAlternative, modelName } from '../src/lib/api';

const TITLE = "Nike Air Max 90 Men's Trainers (CN8490-002)";
const req: PurchaseRequest = { item: TITLE, price: DEMO_PRICES.nike, qty: 1, category: 'clothing', site: 'localhost' };

function stubChrome(sendMessage: (msg: unknown) => Promise<unknown>) {
  vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn(sendMessage) } });
}

afterEach(() => vi.unstubAllGlobals());

describe('modelName', () => {
  it('derives the model from a noisy title', () => {
    expect(modelName(TITLE)).toBe('Nike Air Max 90');
    expect(modelName('Nike Men’s Air Max 90 Trainers, Black, 9 UK')).toBe('Nike Air Max 90');
  });
});

describe('fetchAlternative', () => {
  it('sends only item and price, returns the backend alternative', async () => {
    const alt = { title: 'Nike Air Max 90', price: 99, seller: 'Foot Locker UK', condition: 'new', url: 'https://www.footlocker.co.uk/x' };
    stubChrome(async () => ({ ok: true, data: { alternative: alt, source: 'live' } }));
    expect(await fetchAlternative({ item: TITLE, price: 134.99 })).toEqual(alt);
    const msg = (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(msg).toMatchObject({ type: 'backend', path: '/api/alternatives', timeoutMs: 6500 });
    expect(Object.keys(msg.body).sort()).toEqual(['item', 'price']);
  });

  it('returns null when the backend answers with no alternative', async () => {
    stubChrome(async () => ({ ok: true, data: { alternative: null, source: 'none' } }));
    expect(await fetchAlternative({ item: TITLE, price: 134.99 })).toBeNull();
  });

  it('uses the offline Air Max 90 result when the backend is unreachable', async () => {
    stubChrome(async () => ({ ok: false, error: 'TypeError: Failed to fetch' }));
    expect(await fetchAlternative({ item: TITLE, price: 134.99 })).toEqual(OFFLINE_AIR_MAX_90);
    expect(await fetchAlternative({ item: 'Notebook', price: 4 })).toBeNull();
  });
});

describe('alternativeCopy', () => {
  it('reads exactly as the demo script', () => {
    const alt = withAlternative(AISHA, req, DEMO_TODAY, OFFLINE_AIR_MAX_90)!;
    expect(alternativeCopy(alt, req)).toEqual([
      'Same Nike Air Max 90, £94.49 at Nike UK. Saves £40.50. Check the listing before you buy.',
      'Leaves you £52.50 before payday instead of £12.',
    ]);
    // "instead of" matches the engine's own lowest-with-purchase figure.
    expect(decide(AISHA, req, { today: DEMO_TODAY }).lowestWith.amount).toBe(12);
  });
});
