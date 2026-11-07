import { describe, expect, it } from 'vitest';
import {
  AISHA,
  DEMO_PRICES,
  DEMO_TODAY,
  categorise,
  decide,
  goalHistory,
  recap,
  saveInstead,
  tally,
  type Decision,
  type LogEntry,
  type PurchaseRequest,
  type UserChoice,
} from '@resist/engine';
import { SEED_LOG } from '../src/lib/seed';

const req = (item: string, price: number): PurchaseRequest => ({ item, price, qty: 1, category: categorise(item), site: 'mock-shop' });
const NOTEBOOK = req('A5 Lined Notebook, 80 Sheets, Hardback', DEMO_PRICES.notebook);
const NIKE = req("Nike Air Max 90 Men's Trainers (CN8490-002)", DEMO_PRICES.nike);
const WINE = req('Casillero del Diablo Merlot Red Wine 75cl', DEMO_PRICES.wine);

const log = (r: PurchaseRequest, d: Decision, choice: UserChoice): LogEntry => ({
  ...r,
  outcome: d.outcome,
  choice,
  ruleId: d.ruleBroken?.id ?? null,
  date: DEMO_TODAY,
  at: `${DEMO_TODAY}T12:00:00.000Z`,
});

describe('SEED_LOG', () => {
  it('is dated 2–6 November with complete entries', () => {
    for (const e of SEED_LOG) {
      expect(e.date >= '2026-11-02' && e.date <= '2026-11-06').toBe(true);
      expect(e.at.slice(0, 10)).toBe(e.date);
      expect(e.category).toBe(categorise(e.item));
      expect(e.category).not.toBe('alcohol');
    }
  });

  it('starts at 1 kept, 0 overruled', () => {
    const t = tally(SEED_LOG);
    expect([t.kept, t.overruled]).toEqual([1, 0]);
  });

  it('keeps the demo outcomes: notebook green, Nike amber, wine red (r2)', () => {
    const opts = { today: DEMO_TODAY, log: SEED_LOG };
    expect(decide(AISHA, NOTEBOOK, opts).outcome).toBe('green');
    expect(decide(AISHA, NIKE, opts).outcome).toBe('amber');
    const wine = decide(AISHA, WINE, opts);
    expect(wine.outcome).toBe('red');
    expect(wine.ruleBroken?.id).toBe('r2');
  });

  it('is on pace for the goal before the demo', () => {
    const h = goalHistory(AISHA, SEED_LOG, DEMO_TODAY);
    expect(h.baseline).toBe(12);
    expect(h.saved).toBe(AISHA.goal.saved);
    expect(h.onPace).toBe(true);
  });

  it('after the live demo flow reads 2 kept, 1 overruled', () => {
    let profile = AISHA;
    let l = [...SEED_LOG];
    const step = (r: PurchaseRequest, choice: UserChoice) => {
      const d = decide(profile, r, { today: DEMO_TODAY, log: l });
      l = [...l, log(r, d, choice)];
      if (choice === 'saved') profile = saveInstead(profile, r.price * r.qty);
      return d.outcome;
    };
    expect(step(NOTEBOOK, 'continued')).toBe('green');
    expect(step(NIKE, 'saved')).toBe('amber');
    expect(step(WINE, 'continued')).toBe('red');

    const t = tally(l);
    expect([t.kept, t.overruled]).toEqual([2, 1]);
    const r = recap(profile, l, DEMO_TODAY);
    expect([r.kept, r.overruled]).toEqual([2, 1]);
    expect(r.redirected).toBe(162.99);
    expect(r.perRule.find((p) => p.ruleId === 'r2')).toMatchObject({ kept: 0, overruled: 1 });
    expect(r.goal).toMatchObject({ kept: 2, overruled: 0 });

    const h = goalHistory(profile, l, DEMO_TODAY);
    expect(h.baseline).toBe(12);
    expect(h.saved).toBe(174.99);
    expect(h.onPace).toBe(true);
  });

  it('presenter taking the cheaper option instead also reads 2 kept, 1 overruled', () => {
    const extra: LogEntry[] = [
      log(NOTEBOOK, decide(AISHA, NOTEBOOK, { today: DEMO_TODAY, log: SEED_LOG }), 'continued'),
      { ...log(NIKE, decide(AISHA, NIKE, { today: DEMO_TODAY, log: SEED_LOG }), 'cheaper') },
      log(WINE, decide(AISHA, WINE, { today: DEMO_TODAY, log: SEED_LOG }), 'continued'),
    ];
    const r = recap(AISHA, [...SEED_LOG, ...extra], DEMO_TODAY);
    expect([r.kept, r.overruled, r.redirected]).toEqual([2, 1, 28]);
  });
});
