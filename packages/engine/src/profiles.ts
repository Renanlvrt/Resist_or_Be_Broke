import type { Profile } from './types';

/**
 * Synthetic demo profile "Aisha" (no real bank data). Shaped so the real Nike UK price of
 * Air Max 90 (£134.99) on 7 November leaves £12 on Saturday 28 November, two days before
 * Monday's wages.
 *
 * 487.49 − 30.50 gym − 80 food − 15 phone − 80 food − 55 bus − 80 food = £146.99 on the 28th.
 * 146.99 − 134.99 = £12.
 */
export const AISHA: Profile = {
  setOn: '2026-11-01',
  balance: 487.49,
  income: [
    { label: 'Part-time job', amount: 320, date: '2026-11-30' },
    { label: 'Maintenance Loan', amount: 1450, date: '2027-01-12' },
  ],
  bills: [
    { label: 'Rent', amount: 520, day: 1 },
    { label: 'Gym', amount: 30.5, day: 10 },
    { label: 'Phone', amount: 15, day: 18 },
    { label: 'Bus pass', amount: 55, day: 20 },
    { label: 'Food shop', amount: 80, day: 6, every: 'week' },
  ],
  goal: { label: 'Flights home', amount: 200, by: '2026-12-15', saved: 40 },
  rules: [
    { id: 'r1', type: 'weekly_cap', category: 'takeaway', limit: 30, said: 'Max £30 a week on takeaways.' },
    { id: 'r2', type: 'not_this_month', category: 'alcohol', said: 'No alcohol this month.' },
  ],
  tone: 'supportive',
};

/** The date the demo is pinned to, so the numbers are identical on stage. */
export const DEMO_TODAY = '2026-11-07';

/** Demo products, priced as on the real sites (Nike UK full price for Air Max 90). */
export const DEMO_PRICES = { nike: 134.99, notebook: 4, wine: 8 } as const;
