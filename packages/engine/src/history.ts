import { daysBetween, prettyDate, sameMonth } from './dates';
import { gbp, round2 } from './money';
import { tally, type Tally } from './log';
import type { ISODate, LogEntry, Profile } from './types';

export interface GoalPoint {
  date: ISODate;
  saved: number;
}

export interface GoalHistory {
  /** Step points of the actual saved amount, from setOn up to today (inclusive). */
  points: GoalPoint[];
  /** What was already saved on setOn, before any "Save it instead" in the log. */
  baseline: number;
  /** Straight-line target pace, from {setOn, baseline} to {goal.by, goal.amount}. */
  target: { from: GoalPoint; to: GoalPoint };
  /** Saved as of today. */
  saved: number;
  /** Where the target pace line is today. */
  paceToday: number;
  /** Within £1 of the pace line (or ahead of it) counts as on pace. */
  onPace: boolean;
  /** How far below the pace line, in £ (0 when on pace). */
  behindBy: number;
}

/** Leeway so a few pence of rounding never reads as "behind". */
const PACE_SLACK = 1;

const savedEntries = (profile: Profile, log: LogEntry[], today: ISODate) =>
  log
    .filter((e) => e.choice === 'saved' && e.date >= profile.setOn && e.date <= today)
    .sort((a, b) => (a.date === b.date ? a.at.localeCompare(b.at) : a.date.localeCompare(b.date)));

/**
 * Goal progress over time. profile.goal.saved already includes every "Save it instead" in the log,
 * so the baseline at setOn is saved minus those amounts. 'cheaper' choices don't add to the goal.
 */
export function goalHistory(profile: Profile, log: LogEntry[], today: ISODate): GoalHistory {
  const { goal, setOn } = profile;
  const entries = savedEntries(profile, log, today);
  const allSaved = log.filter((e) => e.choice === 'saved' && e.date >= setOn);
  const baseline = round2(Math.max(0, goal.saved - allSaved.reduce((s, e) => s + e.price * e.qty, 0)));

  const points: GoalPoint[] = [{ date: setOn, saved: baseline }];
  let running = baseline;
  for (const e of entries) {
    running = round2(running + e.price * e.qty);
    const last = points[points.length - 1]!;
    if (last.date === e.date && points.length > 1) last.saved = running;
    else points.push({ date: e.date, saved: running });
  }
  const end = today < setOn ? setOn : today;
  if (points[points.length - 1]!.date !== end) points.push({ date: end, saved: running });

  const span = Math.max(1, daysBetween(setOn, goal.by));
  const elapsed = Math.min(span, Math.max(0, daysBetween(setOn, today)));
  const paceToday = round2(baseline + ((goal.amount - baseline) * elapsed) / span);
  const behind = round2(Math.max(0, paceToday - running));
  const onPace = behind < PACE_SLACK;

  return {
    points,
    baseline,
    target: { from: { date: setOn, saved: baseline }, to: { date: goal.by, saved: goal.amount } },
    saved: running,
    paceToday,
    onPace,
    behindBy: onPace ? 0 : behind,
  };
}

export interface RuleRecap {
  ruleId: string;
  /** The user's exact words. */
  said: string;
  kept: number;
  overruled: number;
}

export interface MonthRecap extends Tally {
  /** "YYYY-MM" of the recap. */
  month: string;
  perRule: RuleRecap[];
  /** Amber check-ins (no rule involved): the goal itself was the reason. */
  goal: { label: string; said: string; kept: number; overruled: number };
}

/** This month's check-ins (same calendar month as today, up to today). */
export function monthLog(log: LogEntry[], today: ISODate): LogEntry[] {
  return log.filter((e) => sameMonth(e.date, today) && e.date <= today);
}

/** Monthly recap: what the user kept, redirected and overruled, per rule in their own words. */
export function recap(profile: Profile, log: LogEntry[], today: ISODate): MonthRecap {
  const month = monthLog(log, today);
  const t = tally(month);
  const perRule = profile.rules.map((r) => {
    const rt = tally(month.filter((e) => e.ruleId === r.id));
    return { ruleId: r.id, said: r.said, kept: rt.kept, overruled: rt.overruled };
  });
  const gt = tally(month.filter((e) => e.outcome === 'amber' && !e.ruleId));
  const { goal } = profile;
  return {
    ...t,
    month: today.slice(0, 7),
    perRule,
    goal: {
      label: goal.label,
      said: `${gbp(goal.amount)} for ${goal.label} by ${prettyDate(goal.by)}.`,
      kept: gt.kept,
      overruled: gt.overruled,
    },
  };
}
