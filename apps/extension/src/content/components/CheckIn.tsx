import { gbp, prettyDate, type Alternative, type UserChoice } from '@resist/engine';
import { useEffect, useRef, useState } from 'react';
import type { ActiveCheckIn } from '../App';
import { AlternativeCard } from './AlternativeCard';
import { Reflection } from './Reflection';

interface Props {
  checkIn: ActiveCheckIn;
  setOn: string;
  alternative: Alternative | null;
  altLoading: boolean;
  onChoice: (choice: UserChoice, answers?: Record<string, string>) => void;
}

/** Amber/red check-in. Inform only: "Continue to checkout" always works. */
export function CheckIn({ checkIn, setOn, alternative, altLoading, onChoice }: Props) {
  const { req, decision, wording } = checkIn;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [why, setWhy] = useState(false);
  const continueRef = useRef<HTMLButtonElement>(null);
  const total = req.price * req.qty;

  useEffect(() => {
    continueRef.current?.focus(); // once, on open
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onChoice('dismissed', answers);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onChoice, answers]);

  return (
    <div className="rob-checkin-wrap" role="dialog" aria-modal="true" aria-labelledby="rob-checkin-title">
      <div className={`rob-checkin rob-${decision.outcome}`}>
        <header className="rob-checkin-head">
          <span className="rob-dot" aria-hidden="true" />
          <h2 id="rob-checkin-title">
            {decision.ruleBroken ? `You told me on ${prettyDate(setOn)}` : 'Before you buy'}
          </h2>
          <button className="rob-x" aria-label="Close" onClick={() => onChoice('dismissed', answers)}>
            ×
          </button>
        </header>

        {decision.ruleBroken && <blockquote className="rob-quote">“{decision.ruleBroken.said}”</blockquote>}
        <p className="rob-text">{wording.text}</p>

        <div className="rob-numbers">
          <div>
            <span>Lowest before payday</span>
            <b>{gbp(decision.lowestWithout.amount)}</b>
          </div>
          <div className="rob-arrow" aria-hidden="true">→</div>
          <div>
            <span>With this ({gbp(total)})</span>
            <b className={decision.lowestWith.amount < 0 ? 'rob-neg' : ''}>{gbp(decision.lowestWith.amount)}</b>
          </div>
          <div>
            <span>on</span>
            <b>{prettyDate(decision.lowestWith.date)}</b>
          </div>
        </div>
        <p className="rob-goal">{decision.goalImpact}</p>

        <AlternativeCard alternative={alternative} loading={altLoading} req={req} />

        {decision.outcome === 'amber' && <Reflection onChange={setAnswers} />}

        <div className="rob-buttons">
          <button ref={continueRef} className="rob-btn rob-primary" onClick={() => onChoice('continued', answers)}>
            Continue to checkout
          </button>
          {alternative && (
            <button className="rob-btn" onClick={() => onChoice('cheaper', answers)}>
              View cheaper option
            </button>
          )}
          <button className="rob-btn" onClick={() => onChoice('saved', answers)}>
            Save it instead
          </button>
          <button className="rob-btn rob-ghost" onClick={() => onChoice('remind', answers)}>
            Remind me in 24h
          </button>
        </div>

        {wording.spoken && (
          <p className="rob-caption" aria-live="polite">
            🔊 “{wording.spoken}”
          </p>
        )}

        <button className="rob-link" aria-expanded={why} onClick={() => setWhy(!why)}>
          Why am I seeing this?
        </button>
        {why && (
          <ul className="rob-why">
            {decision.why?.map((w) => <li key={w}>{w}</li>)}
            <li>It's your call. Nothing is blocked.</li>
          </ul>
        )}
      </div>
    </div>
  );
}
