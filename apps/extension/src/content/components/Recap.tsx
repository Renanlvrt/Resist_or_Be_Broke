import { gbp, parseDate, recap, type ISODate } from '@resist/engine';
import type { State } from '../../lib/storage';

interface Props {
  state: State;
  today: ISODate;
}

const monthName = (d: ISODate) => parseDate(d).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });

/** Monthly recap: kept, redirected, overruled, each rule in the user's words. */
export function Recap({ state, today }: Props) {
  const { profile, log } = state;
  const r = recap(profile, log, today);
  const counts = (kept: number, overruled: number) => (
    <span className="rob-recap-counts">
      kept <b>{kept}</b> · overruled <b>{overruled}</b>
    </span>
  );

  return (
    <div className="rob-recap">
      <div className="rob-recap-intro">
        <h3>Your {monthName(today)} so far</h3>
        <p className="rob-muted">
          {r.checkIns === 0
            ? "No check-ins yet this month. I stay quiet when you're on track."
            : `${r.checkIns} check-in${r.checkIns === 1 ? '' : 's'} since ${parseDate(profile.setOn).getUTCDate()} ${monthName(profile.setOn)}.`}
        </p>
      </div>

      <div className="rob-recap-big">
        <div className="rob-big rob-big-kept">
          <span className="rob-big-n">{r.kept}</span>
          <span className="rob-big-l">promise{r.kept === 1 ? '' : 's'} kept</span>
        </div>
        <div className="rob-big rob-big-redirected">
          <span className="rob-big-n">{gbp(r.redirected)}</span>
          <span className="rob-big-l">redirected to {profile.goal.label}</span>
        </div>
        <div className="rob-big rob-big-overruled">
          <span className="rob-big-n">{r.overruled}</span>
          <span className="rob-big-l">purchase{r.overruled === 1 ? '' : 's'} overruled · your call</span>
        </div>
      </div>

      <section className="rob-card rob-recap-rules">
        <h3>What you told me, and how it went</h3>
        <ul>
          {r.perRule.map((p) => (
            <li key={p.ruleId}>
              <span className="rob-recap-said">“{p.said}”</span>
              {counts(p.kept, p.overruled)}
            </li>
          ))}
          <li>
            <span className="rob-recap-said">
              <span className="rob-recap-tag">Goal</span> {r.goal.said}
            </span>
            {counts(r.goal.kept, r.goal.overruled)}
          </li>
        </ul>
      </section>

      <footer className="rob-recap-close">
        <p>These are your rules. I just kept count.</p>
        <p className="rob-muted">Next month's interview starts from these answers.</p>
      </footer>
    </div>
  );
}
