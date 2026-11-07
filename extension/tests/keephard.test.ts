import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
vi.mock('wxt/browser', () => ({ browser: { storage: { local: { get: vi.fn(), set: vi.fn() } } } }));
import { computeImpact, fmtGbp } from '../keephard/impact';
import { kh, applySavings } from '../keephard/store';
import Dashboard from '../components/Dashboard.vue';
import { detectProduct } from '../../packages/voice/bridge/src/detect';

describe('keephard integration', () => {
  it('computes the goal impact from the demo profile goal and the page price', () => {
    const i = computeImpact({ label: 'Flight home', amount: 150, saved: 40, by: '2026-12-15' }, 120, new Date('2026-11-07T10:00:00'));
    expect(i.savedAfter).toBe(-80); expect(i.toFindBefore).toBe(110); expect(i.toFindAfter).toBe(230);
    expect(i.reachable).toBe(false); expect(i.weeklyAfter).toBeGreaterThan(i.weeklyBefore);
    expect(fmtGbp(-80)).toBe('-£80');
  });
  it('flows recorded savings into the dashboard total and receipt', () => {
    applySavings({ entries: [{ at: 'x', label: 'Pegasus @ SportsShoes', amount: 20 }], savedByKeepHard: 20 });
    const w = mount(Dashboard);
    expect(w.get('[data-saved-amount]').text()).toBe('£151');
    expect(w.findAll('[data-keephard-entry]')).toHaveLength(1);
    applySavings({}); expect(kh.extra).toBe(0);
  });
  it('detects shoe pages and ignores others', () => {
    document.body.innerHTML = '<span id="productTitle">Nike Air Zoom Pegasus 41 Running Shoes</span>';
    expect(detectProduct(document, 'https://www.amazon.co.uk/dp/B0DPHTGD5C', { demo: true, fast: true }).product?.brand).toBeTruthy();
    document.body.innerHTML = '<span id="productTitle">USB cable</span>';
    expect(detectProduct(document, 'https://www.amazon.co.uk/dp/B0DPHTGD5C', { demo: true }).product).toBeUndefined();
  });
});
