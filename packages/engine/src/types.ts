/**
 * Shared contracts. Every package (extension, backend, mock-shop) codes against these.
 * Dates are ISO calendar dates "YYYY-MM-DD" (no time, no timezone). Amounts are GBP.
 */

export type ISODate = string;

export interface Income {
  label: string;
  amount: number;
  date: ISODate;
}

export interface Bill {
  label: string;
  amount: number;
  /**
   * every = 'month' (default): day of month 1–31 (clamped to the month's last day).
   * every = 'week': day of week, 0 = Sunday … 6 = Saturday.
   */
  day: number;
  every?: 'month' | 'week';
}

export interface Goal {
  label: string;
  amount: number;
  by: ISODate;
  saved: number;
}

export type RuleType = 'weekly_cap' | 'not_this_month';

export interface Rule {
  id: string;
  type: RuleType;
  category: Category;
  /** Required for weekly_cap: the most the user wants to spend in this category per week (Mon–Sun). */
  limit?: number;
  /** The user's exact words. Pop-ups quote this back verbatim. */
  said: string;
}

export type Tone = 'supportive' | 'gentle' | 'straight' | 'tough_love';

export interface Profile {
  /** The day the user ran their monthly interview. */
  setOn: ISODate;
  /** Current balance, after today's transactions. */
  balance: number;
  income: Income[];
  bills: Bill[];
  goal: Goal;
  rules: Rule[];
  tone: Tone;
}

export type Category = 'alcohol' | 'takeaway' | 'clothing' | 'other';

export interface PurchaseRequest {
  item: string;
  /** Unit price. Total = price × qty. */
  price: number;
  qty: number;
  category: Category;
  site: string;
}

export type Outcome = 'green' | 'amber' | 'red';

export interface BalancePoint {
  amount: number;
  date: ISODate;
}

export interface Alternative {
  title: string;
  price: number;
  seller: string;
  condition: string;
  url: string;
  saving: number;
  lowestIfChosen: number;
}

export interface Decision {
  outcome: Outcome;
  lowestWith: BalancePoint;
  lowestWithout: BalancePoint;
  ruleBroken: { id: string; said: string } | null;
  goalImpact: string;
  /** Filled by the backend (/api/message) or a local template. */
  message?: string;
  /** Filled by the backend (/api/tts), optional. */
  audioUrl?: string;
  /** Filled by the backend (/api/alternatives) when a cheaper same-model item is found. */
  alternative?: Alternative;
  /** Plain-English working for "Why am I seeing this?". */
  why?: string[];
}

/** One entry in the local decision log (chrome.storage.local). */
export type UserChoice = 'continued' | 'cheaper' | 'saved' | 'remind' | 'dismissed';

export interface LogEntry {
  item: string;
  price: number;
  qty: number;
  category: Category;
  site: string;
  outcome: Outcome;
  choice: UserChoice;
  ruleId: string | null;
  /** Local calendar date of the decision (used for weekly caps). */
  date: ISODate;
  /** ISO timestamp. */
  at: string;
}

/**
 * The only thing that ever leaves the device: item, price, category, the computed
 * numbers and the user's own rule/goal text. No balances history, no transactions.
 */
export interface DecisionSummary {
  item: string;
  price: number;
  category: Category;
  outcome: Outcome;
  lowestWith: BalancePoint;
  lowestWithout: BalancePoint;
  nextIncomeDate: ISODate | null;
  ruleSaid: string | null;
  setOn: ISODate;
  goalLabel: string;
  goalImpact: string;
  tone: Tone;
}
