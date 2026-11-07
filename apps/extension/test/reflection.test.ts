import { describe, expect, it } from 'vitest';
import {
  REFLECTION_QUESTIONS,
  answerLabel,
  cleanAnswers,
  isValidAnswer,
  reflectionEcho,
  stepIndex,
  summarizeAnswers,
  toggleAnswer,
} from '../src/lib/reflection';

describe('reflection questions data', () => {
  it('has the two questions with stable keys and options', () => {
    expect(REFLECTION_QUESTIONS.map((q) => q.key)).toEqual(['need_or_want', 'in_a_week']);
    expect(REFLECTION_QUESTIONS[0]!.options.map((o) => o.value)).toEqual(['need', 'want']);
    expect(REFLECTION_QUESTIONS[1]!.options.map((o) => o.value)).toEqual(['yes', 'not_sure', 'no']);
    expect(REFLECTION_QUESTIONS[1]!.prompt).toBe('Will you still want it in a week?');
  });

  it('uses no judgement words in any copy', () => {
    const copy = [
      ...REFLECTION_QUESTIONS.flatMap((q) => [q.prompt, ...q.options.map((o) => o.label)]),
      reflectionEcho({ need_or_want: 'want', in_a_week: 'no' }),
      reflectionEcho({ need_or_want: 'need', in_a_week: 'yes' }),
      reflectionEcho({ need_or_want: 'want', in_a_week: 'not_sure' }),
    ].join(' ');
    expect(copy).not.toMatch(/should|shouldn|bad|wrong|impulse|waste|regret|careful|sure\?/i);
  });
});

describe('toggleAnswer', () => {
  it('starts empty and sets an answer without mutating the input', () => {
    const empty = {};
    const next = toggleAnswer(empty, 'need_or_want', 'want');
    expect(next).toEqual({ need_or_want: 'want' });
    expect(empty).toEqual({});
  });

  it('switches to a different option', () => {
    expect(toggleAnswer({ need_or_want: 'want' }, 'need_or_want', 'need')).toEqual({ need_or_want: 'need' });
  });

  it('clears when the selected option is clicked again (skippable)', () => {
    expect(toggleAnswer({ need_or_want: 'want', in_a_week: 'no' }, 'need_or_want', 'want')).toEqual({ in_a_week: 'no' });
    expect(toggleAnswer({ in_a_week: 'no' }, 'in_a_week', 'no')).toEqual({});
  });

  it('only includes answered keys', () => {
    let a = toggleAnswer({}, 'in_a_week', 'not_sure');
    expect(Object.keys(a)).toEqual(['in_a_week']);
    a = toggleAnswer(a, 'need_or_want', 'need');
    expect(a).toEqual({ in_a_week: 'not_sure', need_or_want: 'need' });
  });

  it('ignores unknown keys and values', () => {
    expect(toggleAnswer({}, 'mood', 'happy')).toEqual({});
    expect(toggleAnswer({ need_or_want: 'need' }, 'need_or_want', 'maybe')).toEqual({ need_or_want: 'need' });
    expect(isValidAnswer('in_a_week', 'not_sure')).toBe(true);
    expect(isValidAnswer('in_a_week', 'maybe')).toBe(false);
  });
});

describe('cleanAnswers / summarizeAnswers / answerLabel', () => {
  it('drops unknown entries', () => {
    expect(cleanAnswers({ need_or_want: 'want', x: 'y', in_a_week: 'nah' })).toEqual({ need_or_want: 'want' });
    expect(cleanAnswers(undefined)).toEqual({});
  });

  it('summarizes for the recap', () => {
    expect(summarizeAnswers({ need_or_want: 'want', in_a_week: 'not_sure' })).toBe('Want · Not sure in a week');
    expect(summarizeAnswers({ in_a_week: 'yes' })).toBe('Yes in a week');
    expect(summarizeAnswers({ need_or_want: 'need' })).toBe('Need');
    expect(summarizeAnswers({})).toBeNull();
    expect(summarizeAnswers(undefined)).toBeNull();
  });

  it('labels values', () => {
    expect(answerLabel('in_a_week', 'not_sure')).toBe('Not sure');
    expect(answerLabel('need_or_want', 'nope')).toBeUndefined();
  });
});

describe('reflectionEcho', () => {
  it('stays quiet until both are answered', () => {
    expect(reflectionEcho({})).toBeNull();
    expect(reflectionEcho({ need_or_want: 'want' })).toBeNull();
    expect(reflectionEcho({ in_a_week: 'no' })).toBeNull();
  });

  it('acknowledges without advising', () => {
    expect(reflectionEcho({ need_or_want: 'want', in_a_week: 'no' })).toBe('Noted. Your call either way.');
    expect(reflectionEcho({ need_or_want: 'need', in_a_week: 'yes' })).toMatch(/thought it through/);
  });
});

describe('stepIndex', () => {
  it('wraps both ways', () => {
    expect(stepIndex(0, 1, 3)).toBe(1);
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, -1, 3)).toBe(2);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });
});
