import { describe, expect, it } from 'vitest';
import {
  AISHA,
  DEMO_PRICES,
  DEMO_TODAY,
  categorise,
  decide,
  forecast,
  saveInstead,
  tally,
  withAlternative,
  templateWording,
  toSummary,
  type LogEntry,
  type PurchaseRequest,
} from '../src';

const req = (item: string, price: number, qty = 1): PurchaseRequest => ({
  item,
  price,
  qty,
  category: categorise(item),
  site: 'amazon.co.uk',
});

const today = DEMO_TODAY;

describe('forecast', () => {
  it('runs from today to the day before the next income', () => {
    const f = forecast(AISHA, today);
    expect(f.nextIncome?.date).toBe('2026-11-30');
    expect(f.points[0]!.date).toBe('2026-11-07');
    expect(f.points.at(-1)!.date).toBe('2026-11-29');
  });

  it('applies monthly and weekly bills', () => {
    const f = forecast(AISHA, today);
    const on = (d: string) => f.points.find((p) => p.date === d)!;
    expect(on('2026-11-10').events).toEqual(['Gym']);
    expect(on('2026-11-14').events).toEqual(['Food shop']);
    expect(on('2026-11-28').balance).toBe(146.99);
  });

  it('forecasts 30 days when no income is scheduled', () => {
    const f = forecast({ ...AISHA, income: [] }, today);
    expect(f.nextIncome).toBeNull();
    expect(f.points).toHaveLength(30);
  });
});

describe('decide (Aisha)', () => {
  it('£134.99 Nike Air Max 90: amber, £12 on 28 Nov with, £146.99 without', () => {
    const d = decide(AISHA, req('Nike Air Max 90 Men\'s Trainers', DEMO_PRICES.nike), { today });
    expect(d.lowestWith).toEqual({ amount: 12, date: '2026-11-28' });
    expect(d.lowestWithout).toEqual({ amount: 146.99, date: '2026-11-28' });
    expect(d.outcome).toBe('amber');
    expect(d.ruleBroken).toBeNull();
    expect(d.goalImpact).toMatch(/Flights home/);
    expect(d.why?.length).toBeGreaterThan(2);
  });

  it('£4 notebook: green, fits the plan', () => {
    const d = decide(AISHA, req('A5 Lined Notebook', DEMO_PRICES.notebook), { today });
    expect(d.outcome).toBe('green');
    expect(d.goalImpact).toBe('Fits your plan.');
  });

  it('wine: red, quotes the user\'s own words', () => {
    const d = decide(AISHA, req('Casillero del Diablo Merlot Red Wine 75cl', DEMO_PRICES.wine), { today });
    expect(d.outcome).toBe('red');
    expect(d.ruleBroken).toEqual({ id: 'r2', said: 'No alcohol this month.' });
  });

  it('"not this month" lapses in a new month', () => {
    const d = decide(AISHA, req('Red Wine 75cl', 8), { today: '2026-12-02' });
    expect(d.ruleBroken).toBeNull();
  });

  it('takeaway weekly cap counts what was already spent this week', () => {
    const log: LogEntry[] = [
      {
        item: 'Deliveroo pizza', price: 22, qty: 1, category: 'takeaway', site: 'x', outcome: 'green',
        choice: 'continued', ruleId: null, date: '2026-11-03', at: '2026-11-03T20:00:00Z',
      },
    ];
    expect(decide(AISHA, req('Pizza voucher', 7), { today, log }).outcome).toBe('green');
    const d = decide(AISHA, req('Pizza voucher', 12), { today, log });
    expect(d.outcome).toBe('red');
    expect(d.ruleBroken?.said).toBe('Max £30 a week on takeaways.');
    // last week's spending doesn't count
    expect(decide(AISHA, req('Pizza voucher', 12), { today: '2026-11-09', log }).outcome).toBe('green');
  });

  it('red when the balance would go below £0 before payday', () => {
    const d = decide(AISHA, req('Laptop', 160), { today });
    expect(d.lowestWith.amount).toBe(-13.01);
    expect(d.outcome).toBe('red');
    expect(d.ruleBroken).toBeNull();
  });

  it('amber when a purchase eats a big share of the spare money', () => {
    expect(decide(AISHA, req('Headphones', 40), { today }).outcome).toBe('amber');
  });

  it('qty multiplies the price', () => {
    const d = decide(AISHA, req('Notebook', 45, 3), { today });
    expect(d.lowestWith.amount).toBe(11.99);
  });
});

describe('categorise', () => {
  it.each([
    ['Nike Air Max 90 Trainers', 'clothing'],
    ['Echo Falls Rosé Wine 75cl', 'alcohol'],
    ['Just Eat gift card', 'takeaway'],
    ['A5 Lined Notebook', 'other'],
  ])('%s → %s', (title, cat) => expect(categorise(title)).toBe(cat));
});

describe('template wording', () => {
  it('amber matches the PRD lines', () => {
    const r = req('Nike Air Max 90', DEMO_PRICES.nike);
    const w = templateWording(toSummary(AISHA, r, decide(AISHA, r, { today }), today));
    expect(w.text).toBe(
      '£134.99 trainers. Buy these and your balance drops to £12 on 28 November, two days before your next money comes in. It also pushes your Flights home goal back.',
    );
    expect(w.spoken).toBe('These trainers leave you £12 on the 28th. Still want them?');
  });

  it('red quotes the rule and never says "blocked"', () => {
    const r = req('Red Wine 75cl', 8);
    const w = templateWording(toSummary(AISHA, r, decide(AISHA, r, { today }), today));
    expect(w.text).toContain('You told me on 1 November: "No alcohol this month."');
    expect(w.spoken).toBe('You said no alcohol this month. Your call.');
    expect(`${w.text} ${w.spoken}`).not.toMatch(/block|AI thinks/i);
  });

  it('green stays quiet', () => {
    const r = req('Notebook', 4);
    expect(templateWording(toSummary(AISHA, r, decide(AISHA, r, { today }), today)).spoken).toBeNull();
  });
});

describe('privacy', () => {
  it('summary sent to the backend has no balance, bills or income list', () => {
    const r = req('Nike Air Max 90', DEMO_PRICES.nike);
    const s = toSummary(AISHA, r, decide(AISHA, r, { today }), today);
    const json = JSON.stringify(s);
    expect(json).not.toContain('487.49');
    expect(s).not.toHaveProperty('balance');
    expect(s).not.toHaveProperty('bills');
    expect(s).not.toHaveProperty('income');
  });
});

describe('log', () => {
  it('tallies kept and overruled; save-instead moves the goal', () => {
    const base = { qty: 1, site: 'x', ruleId: null, date: today, at: '' } as const;
    const log: LogEntry[] = [
      { ...base, item: 'Notebook', price: 4, category: 'other', outcome: 'green', choice: 'continued' },
      { ...base, item: 'Trainers', price: 60, category: 'clothing', outcome: 'amber', choice: 'saved' },
      { ...base, item: 'Wine', price: 8, category: 'alcohol', outcome: 'red', choice: 'continued' },
    ];
    expect(tally(log)).toEqual({ checkIns: 3, kept: 1, overruled: 1, redirected: 60 });
    expect(saveInstead(AISHA, 60).goal.saved).toBe(100);
    expect(AISHA.goal.saved).toBe(40);
  });
});

describe('cheaper option', () => {
  it('Nike UK £94.49 saves £40.50 and leaves £52.50 on the 28th', () => {
    const r = req('Nike Air Max 90', DEMO_PRICES.nike);
    const alt = withAlternative(AISHA, r, today, {
      title: 'Nike Air Max 90 Premium', price: 94.49, seller: 'Nike UK', condition: 'new',
      url: 'https://www.nike.com/gb/w/mens-air-max-90-shoes-auqmoznik1zy7ok',
    });
    expect(alt?.saving).toBe(40.5);
    expect(alt?.lowestIfChosen).toBe(52.5);
  });

  it('ignores options that are not cheaper', () => {
    const r = req('Nike Air Max 90', DEMO_PRICES.nike);
    expect(withAlternative(AISHA, r, today, { title: 'x', price: 140, seller: 's', condition: 'new', url: 'u' })).toBeNull();
  });
});
