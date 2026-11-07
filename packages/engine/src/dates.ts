import type { ISODate } from './types';

/** All date maths in UTC on calendar dates, so results never depend on the user's timezone. */

export function parseDate(d: ISODate): Date {
  return new Date(`${d}T00:00:00Z`);
}

export function formatDate(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = parseDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return formatDate(x);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}

/** Today's local calendar date as ISODate. */
export function todayISO(now: Date = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function daysInMonth(d: ISODate): number {
  const x = parseDate(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
}

export function sameMonth(a: ISODate, b: ISODate): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** Monday of the week containing d. */
export function weekStart(d: ISODate): ISODate {
  const dow = parseDate(d).getUTCDay(); // 0 = Sun
  return addDays(d, -((dow + 6) % 7));
}

/** "28 November" */
export function prettyDate(d: ISODate): string {
  const x = parseDate(d);
  return `${x.getUTCDate()} ${x.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })}`;
}

/** "28th" */
export function ordinalDay(d: ISODate): string {
  const n = parseDate(d).getUTCDate();
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}
