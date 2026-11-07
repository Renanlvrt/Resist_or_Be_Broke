import { describe, expect, it } from 'vitest';
import { AISHA, goalHistory, monthLog, recap, saveInstead, type LogEntry } from '../src';

const entry = (over: Partial<LogEntry>): LogEntry => ({
  item: 'Thing',
  price: 10,
  qty: 1,
  category: 'other',
  site: 'mock-shop',
  outcome: 'green',
  choice: 'continued',
  ruleId: null,
  date: '2026-11-03',
  at: `${over.date ?? '2026-11-03'}T12:00:00.000Z`,
  ...over,
});

describe('goalHistory', () => {
  it('with no log: flat at saved from setOn to today, target from baseline to goal', () => {
    const h = goalHistory(AISHA, [], '2026-11-07');
    expect(h.baseline).toBe(40);
    expect(h.points).toEqual([
      { date: '2026-11-01', saved: 40 },
      { date: '2026-11-07', saved: 40 },
    ]);
    expect(h.target).toEqual({ from: { date: '2026-11-01', saved: 40 }, to: { date: '2026-12-15', saved: 200 } });
    // 40 + 160 × 6/44 = 61.82
    expect(h.paceToday).toBe(61.82);
    expect(h.onPace).toBe(false);
    expect(h.behindBy).toBe(21.82);
  });

  it('baseline excludes logged "Save it instead"; steps up on saved, not on cheaper', () => {
    const log = [
      entry({ date: '2026-11-04', outcome: 'amber', choice: 'saved', price: 28 }),
      entry({ date: '2026-11-05', outcome: 'amber', choice: 'cheaper', price: 50 }),
      entry({ date: '2026-11-06', outcome: 'green', choice: 'continued', price: 12 }),
    ];
    const h = goalHistory(AISHA, log, '2026-11-07');
    expect(h.baseline).toBe(12);
    expect(h.points).toEqual([
      { date: '2026-11-01', saved: 12 },
      { date: '2026-11-04', saved: 40 },
      { date: '2026-11-07', saved: 40 },
    ]);
    expect(h.saved).toBe(40);
    expect(h.onPace).toBe(true);
    expect(h.behindBy).toBe(0);
  });

  it('merges same-day saves into one step and ends at today', () => {
    const profile = saveInstead(saveInstead(AISHA, 10), 5);
    const log = [
      entry({ date: '2026-11-07', outcome: 'amber', choice: 'saved', price: 10, at: '2026-11-07T10:00:00Z' }),
      entry({ date: '2026-11-07', outcome: 'red', choice: 'saved', price: 5, at: '2026-11-07T11:00:00Z' }),
    ];
    const h = goalHistory(profile, log, '2026-11-07');
    expect(h.baseline).toBe(40);
    expect(h.points).toEqual([
      { date: '2026-11-01', saved: 40 },
      { date: '2026-11-07', saved: 55 },
    ]);
  });
});

describe('recap', () => {
  const log = [
    entry({ date: '2026-10-28', outcome: 'amber', choice: 'saved', price: 99 }), // last month: ignored
    entry({ date: '2026-11-02', outcome: 'green' }),
    entry({ date: '2026-11-04', outcome: 'amber', choice: 'saved', price: 28 }),
    entry({ date: '2026-11-05', outcome: 'amber', choice: 'cheaper', price: 60 }),
    entry({ date: '2026-11-05', outcome: 'red', choice: 'continued', ruleId: 'r2', price: 8 }),
    entry({ date: '2026-11-06', outcome: 'red', choice: 'remind', ruleId: 'r1', price: 14 }),
    entry({ date: '2026-11-06', outcome: 'amber', choice: 'continued', price: 40 }),
    entry({ date: '2026-11-06', outcome: 'amber', choice: 'dismissed', price: 40 }),
  ];

  it('scopes to the current month', () => {
    expect(monthLog(log, '2026-11-07')).toHaveLength(7);
  });

  it('counts kept, overruled, redirected and check-ins', () => {
    const r = recap(AISHA, log, '2026-11-07');
    expect(r.month).toBe('2026-11');
    expect(r.checkIns).toBe(7);
    expect(r.kept).toBe(3);
    expect(r.overruled).toBe(2);
    expect(r.redirected).toBe(28);
  });

  it("quotes each rule in the user's words with its own counts", () => {
    const r = recap(AISHA, log, '2026-11-07');
    expect(r.perRule).toEqual([
      { ruleId: 'r1', said: 'Max £30 a week on takeaways.', kept: 1, overruled: 0 },
      { ruleId: 'r2', said: 'No alcohol this month.', kept: 0, overruled: 1 },
    ]);
    expect(r.goal).toEqual({ label: 'Flights home', said: '£200 for Flights home by 15 December.', kept: 2, overruled: 1 });
  });

  it('is all zeros with an empty log', () => {
    const r = recap(AISHA, [], '2026-11-07');
    expect([r.kept, r.overruled, r.redirected, r.checkIns]).toEqual([0, 0, 0, 0]);
    expect(r.perRule.map((p) => p.kept + p.overruled)).toEqual([0, 0]);
  });
});
