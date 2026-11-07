// Reflection questions shown in AMBER check-ins only. Pure data + helpers (no React, no DOM),
// so they can be unit-tested in node. Answers are always optional: nothing is pre-selected,
// nothing is required, and they never gate "Continue to checkout".

export type ReflectionKey = 'need_or_want' | 'in_a_week';

export interface ReflectionOption {
  /** Short stable value stored in the log (e.g. "want"). */
  value: string;
  label: string;
}

export interface ReflectionQuestion {
  /** Short stable key stored in LogEntry.answers. */
  key: ReflectionKey;
  prompt: string;
  options: readonly ReflectionOption[];
}

export const REFLECTION_QUESTIONS: readonly ReflectionQuestion[] = [
  {
    key: 'need_or_want',
    prompt: 'Need or want?',
    options: [
      { value: 'need', label: 'Need' },
      { value: 'want', label: 'Want' },
    ],
  },
  {
    key: 'in_a_week',
    prompt: 'Will you still want it in a week?',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'not_sure', label: 'Not sure' },
      { value: 'no', label: 'No' },
    ],
  },
];

export const REFLECTION_HINT = 'Optional — just for you.';

export type ReflectionAnswers = Record<string, string>;

function findQuestion(key: string): ReflectionQuestion | undefined {
  return REFLECTION_QUESTIONS.find((q) => q.key === key);
}

export function isValidAnswer(key: string, value: string): boolean {
  return !!findQuestion(key)?.options.some((o) => o.value === value);
}

/**
 * Select `value` for `key`, or clear it if it is already selected (questions are skippable).
 * Returns a new record containing only answered keys; unknown keys/values are ignored.
 */
export function toggleAnswer(answers: ReflectionAnswers, key: string, value: string): ReflectionAnswers {
  if (!isValidAnswer(key, value)) return { ...answers };
  const next = { ...answers };
  if (next[key] === value) delete next[key];
  else next[key] = value;
  return next;
}

/** Keep only known keys with valid values, in question order. */
export function cleanAnswers(answers: ReflectionAnswers | undefined): ReflectionAnswers {
  const out: ReflectionAnswers = {};
  if (!answers) return out;
  for (const q of REFLECTION_QUESTIONS) {
    const v = answers[q.key];
    if (v !== undefined && isValidAnswer(q.key, v)) out[q.key] = v;
  }
  return out;
}

/** Human label for a stored answer, e.g. ("in_a_week","not_sure") → "Not sure". */
export function answerLabel(key: string, value: string): string | undefined {
  return findQuestion(key)?.options.find((o) => o.value === value)?.label;
}

/**
 * Short, neutral summary for the dashboard / monthly recap, e.g. "Want · Not sure in a week".
 * Returns null when nothing was answered.
 */
export function summarizeAnswers(answers: ReflectionAnswers | undefined): string | null {
  const a = cleanAnswers(answers);
  const parts: string[] = [];
  if (a.need_or_want) parts.push(answerLabel('need_or_want', a.need_or_want)!);
  if (a.in_a_week) parts.push(`${answerLabel('in_a_week', a.in_a_week)} in a week`);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * Gentle one-line echo once both questions are answered. Never judgemental: it acknowledges,
 * it doesn't advise. Returns null until both are answered.
 */
export function reflectionEcho(answers: ReflectionAnswers): string | null {
  const a = cleanAnswers(answers);
  if (!a.need_or_want || !a.in_a_week) return null;
  if (a.in_a_week === 'yes') return 'Sounds like you’ve thought it through.';
  return 'Noted. Your call either way.';
}

/** Wrap-around index for arrow-key navigation inside a radiogroup. */
export function stepIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (((current + delta) % length) + length) % length;
}
