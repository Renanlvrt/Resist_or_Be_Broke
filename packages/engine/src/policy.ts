import { daysBetween, prettyDate } from './dates';
import { forecast } from './forecast';
import { gbp, round2 } from './money';
import { checkRules } from './rules';
import type { Alternative, Decision, DecisionSummary, ISODate, LogEntry, Outcome, Profile, PurchaseRequest } from './types';

export const POLICY = {
  /** Amber if the purchase leaves less than this before the next income. */
  cushion: 25,
  /** Amber if the purchase eats more than this share of the spare money before the next income (that's goal money). */
  goalShare: 0.25,
} as const;

export interface DecideOptions {
  today: ISODate;
  log?: LogEntry[];
}

/**
 * green = fits the plan; amber = dents the goal (or leaves you tight);
 * red = breaks a rule the user set, or takes the balance below £0 before the next income.
 */
export function decide(profile: Profile, req: PurchaseRequest, opts: DecideOptions): Decision {
  const { today, log = [] } = opts;
  const total = round2(req.price * req.qty);
  const without = forecast(profile, today, 0);
  const withP = forecast(profile, today, total);
  const hit = checkRules(profile, req, today, log);
  const spare = Math.max(without.lowest.amount, 0);
  const remaining = round2(Math.max(profile.goal.amount - profile.goal.saved, 0));

  const why: string[] = [];
  why.push(
    `Balance today: ${gbp(profile.balance)}.` +
      (without.nextIncome
        ? ` Next money in: ${without.nextIncome.label} ${gbp(without.nextIncome.amount)} on ${prettyDate(without.nextIncome.date)}.`
        : ' No income scheduled, so this looks 30 days ahead.'),
  );
  const billsBefore = summariseBills(without.points.flatMap((p) => p.events), profile);
  if (billsBefore) why.push(`Bills before then: ${billsBefore}.`);
  why.push(
    `Lowest point without this: ${gbp(without.lowest.amount)} on ${prettyDate(without.lowest.date)}. With it: ${gbp(withP.lowest.amount)}.`,
  );

  let outcome: Outcome = 'green';
  if (hit) {
    outcome = 'red';
    why.push(`You set this rule on ${prettyDate(profile.setOn)}: "${hit.rule.said}".`);
    if (hit.spentThisWeek !== undefined && hit.rule.limit !== undefined) {
      why.push(
        `Spent on ${hit.rule.category} this week: ${gbp(hit.spentThisWeek)}. With this: ${gbp(hit.spentThisWeek + total)} of your ${gbp(hit.rule.limit)}.`,
      );
    }
  } else if (withP.lowest.amount < 0) {
    outcome = 'red';
    why.push(`This takes you below £0 before your next money comes in.`);
  } else if (withP.lowest.amount < POLICY.cushion) {
    outcome = 'amber';
    why.push(`It leaves less than ${gbp(POLICY.cushion)} spare before your next money comes in.`);
  } else if (total > POLICY.goalShare * spare) {
    outcome = 'amber';
    why.push(`It uses more than a quarter of your ${gbp(spare)} spare money — money that could go to ${profile.goal.label}.`);
  }

  const goalImpact =
    outcome === 'green' || remaining === 0
      ? 'Fits your plan.'
      : `Delays your ${profile.goal.label} goal: ${gbp(total)} less towards the ${gbp(remaining)} still to go by ${prettyDate(profile.goal.by)}.`;

  return {
    outcome,
    lowestWith: withP.lowest,
    lowestWithout: without.lowest,
    ruleBroken: hit ? { id: hit.rule.id, said: hit.rule.said } : null,
    goalImpact,
    why,
  };
}

function summariseBills(events: string[], profile: Profile): string {
  const counts = new Map<string, number>();
  for (const e of events) if (e !== 'This purchase') counts.set(e, (counts.get(e) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, n]) => {
      const amount = profile.bills.find((b) => b.label === label)?.amount ?? 0;
      return n > 1 ? `${label} ${gbp(amount)} × ${n}` : `${label} ${gbp(amount)}`;
    })
    .join(', ');
}

/** The minimal, privacy-safe payload the backend is allowed to see. */
export function toSummary(profile: Profile, req: PurchaseRequest, d: Decision, today: ISODate): DecisionSummary {
  const next = forecast(profile, today).nextIncome;
  return {
    item: req.item,
    price: round2(req.price * req.qty),
    category: req.category,
    outcome: d.outcome,
    lowestWith: d.lowestWith,
    lowestWithout: d.lowestWithout,
    nextIncomeDate: next?.date ?? null,
    ruleSaid: d.ruleBroken?.said ?? null,
    setOn: profile.setOn,
    goalLabel: profile.goal.label,
    goalImpact: d.goalImpact,
    tone: profile.tone,
  };
}

/** Days between the lowest point and the next income, for wording like "two days before payday". */
export function daysBeforeIncome(s: Pick<DecisionSummary, 'lowestWith' | 'nextIncomeDate'>): number | null {
  return s.nextIncomeDate ? daysBetween(s.lowestWith.date, s.nextIncomeDate) : null;
}

/** Lowest balance before the next income if the user buys the cheaper option instead. */
export function lowestIfChosen(profile: Profile, today: ISODate, altPrice: number, qty = 1): number {
  return forecast(profile, today, round2(altPrice * qty)).lowest.amount;
}

/** Turn a raw match from /api/alternatives into the Decision's alternative (saving + lowestIfChosen). */
export function withAlternative(
  profile: Profile,
  req: PurchaseRequest,
  today: ISODate,
  alt: Pick<Alternative, 'title' | 'price' | 'seller' | 'condition' | 'url'>,
): Alternative | null {
  if (!(alt.price < req.price)) return null;
  return {
    ...alt,
    saving: round2((req.price - alt.price) * req.qty),
    lowestIfChosen: lowestIfChosen(profile, today, alt.price, req.qty),
  };
}
