import { useRef, useState, type KeyboardEvent } from 'react';
import {
  REFLECTION_HINT,
  REFLECTION_QUESTIONS,
  reflectionEcho,
  stepIndex,
  toggleAnswer,
  type ReflectionAnswers,
} from '../../lib/reflection';

interface Props {
  /** Called with question → answer whenever an answer changes. Skippable: never required. */
  onChange: (answers: Record<string, string>) => void;
}

/** 1–2 skippable reflection questions, amber only. Nothing pre-selected; click again to clear. */
export function Reflection({ onChange }: Props) {
  const [answers, setAnswers] = useState<ReflectionAnswers>({});
  const chips = useRef(new Map<string, HTMLButtonElement>());

  const keepFocus = (id: string) => {
    // The parent re-focuses "Continue" when answers change; put focus back on the chip the
    // person is using so keyboard navigation isn't interrupted.
    requestAnimationFrame(() => chips.current.get(id)?.focus());
  };

  const pick = (key: string, value: string, opts: { clearable: boolean }) => {
    const already = answers[key] === value;
    if (already && !opts.clearable) return;
    const next = toggleAnswer(answers, key, value);
    setAnswers(next);
    onChange(next);
    keepFocus(`${key}:${value}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, key: string, index: number) => {
    const q = REFLECTION_QUESTIONS.find((x) => x.key === key)!;
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    e.stopPropagation();
    const opt = q.options[stepIndex(index, delta, q.options.length)]!;
    pick(key, opt.value, { clearable: false });
  };

  const echo = reflectionEcho(answers);

  return (
    <div className="rob-reflect">
      {REFLECTION_QUESTIONS.map((q) => {
        const labelId = `rob-reflect-${q.key}`;
        const selected = answers[q.key];
        return (
          <div className="rob-reflect-row" key={q.key}>
            <span className="rob-reflect-q" id={labelId}>
              {q.prompt}
            </span>
            <div className="rob-chips" role="radiogroup" aria-labelledby={labelId}>
              {q.options.map((o, i) => {
                const checked = selected === o.value;
                // Roving tabindex: one tab stop per group (the selected chip, else the first).
                const tabbable = selected ? checked : i === 0;
                return (
                  <button
                    key={o.value}
                    ref={(el) => {
                      const id = `${q.key}:${o.value}`;
                      if (el) chips.current.set(id, el);
                      else chips.current.delete(id);
                    }}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    tabIndex={tabbable ? 0 : -1}
                    className={`rob-chip${checked ? ' rob-chip-on' : ''}`}
                    onClick={() => pick(q.key, o.value, { clearable: true })}
                    onKeyDown={(e) => onKeyDown(e, q.key, i)}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className={`rob-reflect-note${echo ? ' rob-reflect-echo' : ''}`} aria-live="polite">
        {echo ?? REFLECTION_HINT}
      </p>
    </div>
  );
}
