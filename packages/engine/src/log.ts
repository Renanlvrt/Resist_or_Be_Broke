import { round2 } from './money';
import type { LogEntry, Profile } from './types';

export interface Tally {
  checkIns: number;
  /** Amber/red check-ins where the user chose not to go ahead (saved, cheaper, remind). */
  kept: number;
  /** Amber/red check-ins where the user continued anyway. Their call — we just count it. */
  overruled: number;
  /** Money moved to the goal via "Save it instead" or saved via the cheaper option. */
  redirected: number;
}

export function tally(log: LogEntry[]): Tally {
  const flagged = log.filter((e) => e.outcome !== 'green');
  return {
    checkIns: log.length,
    kept: flagged.filter((e) => e.choice === 'saved' || e.choice === 'cheaper' || e.choice === 'remind').length,
    overruled: flagged.filter((e) => e.choice === 'continued').length,
    redirected: round2(flagged.filter((e) => e.choice === 'saved').reduce((s, e) => s + e.price * e.qty, 0)),
  };
}

/** "Save it instead": put the amount towards the goal (returns a new profile). */
export function saveInstead(profile: Profile, amount: number): Profile {
  return { ...profile, goal: { ...profile.goal, saved: round2(profile.goal.saved + amount) } };
}
