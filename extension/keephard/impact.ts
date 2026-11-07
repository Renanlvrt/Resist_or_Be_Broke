export interface GoalInput { label: string; amount: number; saved: number; by: string }
export interface ImpactView {
  label: string; amount: number; by: string; price: number;
  savedBefore: number; savedAfter: number; toFindBefore: number; toFindAfter: number;
  weeklyBefore: number; weeklyAfter: number; daysLeft: number; reachable: boolean;
}
const r2 = (n: number) => Math.round(n * 100) / 100;
/** Pure: what buying `price` does to the goal. Nothing invented: goal from the profile, price from the page,
 *  weekly pace = money still to find / weeks left until the goal date. */
export function computeImpact(goal: GoalInput, price: number, now: Date = new Date()): ImpactView {
  const daysLeft = Math.max(1, Math.ceil((Date.parse(goal.by + 'T23:59:59') - now.getTime()) / 86400000));
  const weeks = Math.max(1, daysLeft / 7);
  const savedAfter = r2(goal.saved - price);
  const toFindBefore = r2(Math.max(0, goal.amount - goal.saved));
  const toFindAfter = r2(Math.max(0, goal.amount - savedAfter));
  return {
    label: goal.label, amount: goal.amount, by: goal.by, price,
    savedBefore: goal.saved, savedAfter, toFindBefore, toFindAfter,
    weeklyBefore: r2(toFindBefore / weeks), weeklyAfter: r2(toFindAfter / weeks), daysLeft,
    // spending more than you have put aside for the goal pushes it past its full amount
    reachable: savedAfter >= 0,
  };
}
export const fmtGbp = (n: number) => (n < 0 ? '-' : '') + '£' + (Number.isInteger(Math.abs(n)) ? String(Math.abs(n)) : Math.abs(n).toFixed(2));
export function fmtDate(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
