import { ordinalDay, prettyDate } from './dates';
import { gbp } from './money';
import { daysBeforeIncome } from './policy';
import type { Category, DecisionSummary } from './types';

/**
 * Template wording built only from the engine's numbers. Used instantly, and as the
 * fallback whenever the LLM is slow (>2 s) or fails. Rule: always "You told me…" /
 * "Your plan says…", never "blocked" or "the AI thinks".
 */
export interface Wording {
  /** On-screen text. */
  text: string;
  /** Short spoken line (null for green: we stay quiet). */
  spoken: string | null;
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

interface Noun {
  short: string;
  subject: string;
  plural: boolean;
}

function noun(category: Category, item: string): Noun {
  if (category === 'clothing' && /trainer|sneaker|shoe|boot|air max|jordan/i.test(item))
    return { short: 'trainers', subject: 'These trainers', plural: true };
  if (category === 'clothing') return { short: 'clothes', subject: 'These clothes', plural: true };
  if (category === 'takeaway') return { short: 'takeaway', subject: 'This takeaway', plural: false };
  if (category === 'alcohol') return { short: 'drinks', subject: 'This', plural: false };
  return { short: shortTitle(item), subject: 'This', plural: false };
}

export function shortTitle(item: string, words = 4): string {
  const w = item.split(/\s+/).filter(Boolean);
  return w.length > words ? `${w.slice(0, words).join(' ')}…` : item;
}

function whenBefore(s: DecisionSummary): string {
  const n = daysBeforeIncome(s);
  if (n === null) return '';
  if (n <= 0) return '';
  const w = NUMBER_WORDS[n] ?? String(n);
  return n === 1 ? ', the day before your next money comes in' : `, ${w} days before your next money comes in`;
}

const CATEGORY_WORDS: Record<Category, string> = {
  alcohol: 'alcohol',
  takeaway: 'a takeaway',
  clothing: 'clothes',
  other: 'this',
};

export function templateWording(s: DecisionSummary): Wording {
  const n = noun(s.category, s.item);
  const low = s.lowestWith;
  const it = n.plural ? 'them' : 'it';
  const verb = (singular: string, plural: string) => (n.plural ? plural : singular);

  if (s.outcome === 'green') return { text: 'Fits your plan.', spoken: null };

  if (s.outcome === 'red' && s.ruleSaid) {
    return {
      text: `You told me on ${prettyDate(s.setOn)}: "${s.ruleSaid}" This looks like ${CATEGORY_WORDS[s.category]}. Your call.`,
      spoken: `You said ${stripPunct(lowerFirst(s.ruleSaid))}. Your call.`,
    };
  }

  if (s.outcome === 'red') {
    return {
      text: `${gbp(s.price)} ${n.short}. Your plan says this takes you to ${gbp(low.amount)} on ${prettyDate(low.date)}${whenBefore(s)}. Your call.`,
      spoken: `${n.subject} ${verb('takes', 'take')} you to ${gbp(low.amount)} on the ${ordinalDay(low.date)}. Your call.`,
    };
  }

  return {
    text: `${gbp(s.price)} ${n.short}. Buy ${n.plural ? 'these' : 'this'} and your balance drops to ${gbp(low.amount)} on ${prettyDate(low.date)}${whenBefore(s)}. It also pushes your ${s.goalLabel} goal back.`,
    spoken: `${n.subject} ${verb('leaves', 'leave')} you ${gbp(low.amount)} on the ${ordinalDay(low.date)}. Still want ${it}?`,
  };
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function stripPunct(s: string): string {
  return s.replace(/[.!?]+$/, '');
}
