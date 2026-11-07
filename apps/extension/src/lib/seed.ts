import type { LogEntry } from '@resist/engine';

/**
 * Decision log seeded on first run / "Reset demo" so the dashboard isn't empty.
 * Aisha's first week (Mon 2 – Fri 6 November): three green check-ins and one amber she kept
 * ("Save it instead" on a hoodie). AISHA.goal.saved (£40) already includes that £28.
 *
 * Demo-safe on purpose: no alcohol, and only £9.99 of takeaway in the week of 2 November
 * (cap £30), so on 7 November the notebook is still green, the Nike Air Max 90 amber and the
 * wine red. After the live demo (Nike kept, wine overruled) the dashboard reads 2 kept, 1 overruled.
 */
export const SEED_LOG: LogEntry[] = [
  {
    item: 'Stabilo Boss Highlighters, Pack of 6',
    price: 4.5,
    qty: 1,
    category: 'other',
    site: 'amazon.co.uk',
    outcome: 'green',
    choice: 'continued',
    ruleId: null,
    date: '2026-11-02',
    at: '2026-11-02T10:14:00.000Z',
  },
  {
    item: "Domino's Medium Margherita Pizza",
    price: 9.99,
    qty: 1,
    category: 'takeaway',
    site: 'dominos.co.uk',
    outcome: 'green',
    choice: 'continued',
    ruleId: null,
    date: '2026-11-03',
    at: '2026-11-03T19:42:00.000Z',
  },
  {
    item: 'ASOS DESIGN Oversized Hoodie in Grey Marl',
    price: 28,
    qty: 1,
    category: 'clothing',
    site: 'asos.com',
    outcome: 'amber',
    choice: 'saved',
    ruleId: null,
    date: '2026-11-04',
    at: '2026-11-04T21:05:00.000Z',
  },
  {
    item: 'Casio FX-83GTX Scientific Calculator',
    price: 11.99,
    qty: 1,
    category: 'other',
    site: 'amazon.co.uk',
    outcome: 'green',
    choice: 'continued',
    ruleId: null,
    date: '2026-11-06',
    at: '2026-11-06T09:30:00.000Z',
  },
];
