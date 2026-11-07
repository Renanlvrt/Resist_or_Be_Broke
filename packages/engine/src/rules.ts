import { sameMonth, weekStart } from './dates';
import { round2 } from './money';
import type { ISODate, LogEntry, Profile, PurchaseRequest, Rule } from './types';

export interface RuleCheck {
  rule: Rule;
  /** For weekly caps: spent in this category this week before this purchase. */
  spentThisWeek?: number;
}

/** Money that actually left: anything the user went ahead with (green passes are logged as 'continued'). */
export function spentInWeek(log: LogEntry[], category: string, today: ISODate): number {
  const from = weekStart(today);
  return round2(
    log
      .filter((e) => e.category === category && e.choice === 'continued' && e.date >= from && e.date <= today)
      .reduce((sum, e) => sum + e.price * e.qty, 0),
  );
}

export function isRuleActive(rule: Rule, profile: Profile, today: ISODate): boolean {
  if (rule.type === 'not_this_month') return sameMonth(profile.setOn, today);
  return true;
}

/** First user rule this purchase breaks, or null. The AI never judges an item: only these rules do. */
export function checkRules(
  profile: Profile,
  req: PurchaseRequest,
  today: ISODate,
  log: LogEntry[] = [],
): RuleCheck | null {
  const total = req.price * req.qty;
  for (const rule of profile.rules) {
    if (rule.category !== req.category || !isRuleActive(rule, profile, today)) continue;
    if (rule.type === 'not_this_month') return { rule };
    if (rule.type === 'weekly_cap') {
      const spent = spentInWeek(log, rule.category, today);
      if (rule.limit !== undefined && spent + total > rule.limit) return { rule, spentThisWeek: spent };
    }
  }
  return null;
}
