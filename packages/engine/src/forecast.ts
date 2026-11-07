import { addDays, daysInMonth, parseDate } from './dates';
import { round2 } from './money';
import type { BalancePoint, Bill, ISODate, Income, Profile } from './types';

export interface ForecastPoint {
  date: ISODate;
  balance: number;
  /** Labels of bills that land on this date. */
  events: string[];
}

export interface Forecast {
  start: ISODate;
  /** The next income after today, or null if none is scheduled. */
  nextIncome: Income | null;
  /** Daily balances from today up to (not including) the next income date. */
  points: ForecastPoint[];
  lowest: BalancePoint;
}

/** If no income is scheduled, forecast this many days ahead. */
export const DEFAULT_HORIZON_DAYS = 30;

export function nextIncome(profile: Profile, today: ISODate): Income | null {
  const future = profile.income.filter((i) => i.date > today).sort((a, b) => a.date.localeCompare(b.date));
  return future[0] ?? null;
}

export function billDueOn(bill: Bill, date: ISODate): boolean {
  const d = parseDate(date);
  if (bill.every === 'week') return d.getUTCDay() === bill.day;
  return d.getUTCDate() === Math.min(bill.day, daysInMonth(date));
}

/**
 * Plain-code daily balance forecast (no AI). Starts from today's balance minus `spendToday`
 * (the purchase being considered), then applies each bill on its due date up to the day
 * before the next income. Returns every day plus the lowest point (earliest date if tied).
 */
export function forecast(profile: Profile, today: ISODate, spendToday = 0): Forecast {
  const income = nextIncome(profile, today);
  const end = income ? income.date : addDays(today, DEFAULT_HORIZON_DAYS);

  let balance = round2(profile.balance - spendToday);
  const points: ForecastPoint[] = [{ date: today, balance, events: spendToday ? ['This purchase'] : [] }];
  let lowest: BalancePoint = { amount: balance, date: today };

  for (let date = addDays(today, 1); date < end; date = addDays(date, 1)) {
    const due = profile.bills.filter((b) => billDueOn(b, date));
    for (const b of due) balance = round2(balance - b.amount);
    points.push({ date, balance, events: due.map((b) => b.label) });
    if (balance < lowest.amount) lowest = { amount: balance, date };
  }

  return { start: today, nextIncome: income, points, lowest };
}
