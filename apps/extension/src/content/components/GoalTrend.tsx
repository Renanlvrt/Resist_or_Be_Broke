import { daysBetween, gbp, goalHistory, prettyDate, type ISODate, type LogEntry, type Profile } from '@resist/engine';

interface Props {
  profile: Profile;
  log: LogEntry[];
  today: ISODate;
}

/** Goal progress line: saved (solid step line) vs target pace (dashed), setOn → goal date. Plain SVG. */
export function GoalTrend({ profile, log, today }: Props) {
  const { goal, setOn } = profile;
  const h = goalHistory(profile, log, today);
  const W = 320;
  const H = 130;
  const P = { l: 36, r: 10, t: 10, b: 20 };
  const span = Math.max(1, daysBetween(setOn, goal.by));
  const top = Math.max(goal.amount, h.saved);
  const x = (d: ISODate) => P.l + (Math.min(span, Math.max(0, daysBetween(setOn, d))) / span) * (W - P.l - P.r);
  const y = (v: number) => P.t + ((top - v) / (top || 1)) * (H - P.t - P.b);

  // Step line: the amount holds until the next "Save it instead".
  const d = h.points.map((p, i) => (i === 0 ? `M${x(p.date)},${y(p.saved)}` : `H${x(p.date)} V${y(p.saved)}`)).join(' ');
  const last = h.points[h.points.length - 1]!;
  const pace = h.onPace ? 'On pace' : `${gbp(h.behindBy)} behind pace`;
  const label = `${goal.label}: ${gbp(h.saved)} of ${gbp(goal.amount)} saved by ${prettyDate(today)}. ${pace} for ${prettyDate(goal.by)}.`;

  return (
    <div className="rob-trend">
      <svg className="rob-trend-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <line x1={P.l} x2={W - P.r} y1={y(0)} y2={y(0)} className="rob-trend-axis" />
        <line x1={P.l} x2={W - P.r} y1={y(goal.amount)} y2={y(goal.amount)} className="rob-trend-grid" />
        <text x={P.l - 6} y={y(goal.amount) + 4} className="rob-chart-label" textAnchor="end">{gbp(goal.amount)}</text>
        <text x={P.l - 6} y={y(0) + 4} className="rob-chart-label" textAnchor="end">£0</text>
        <line
          x1={x(h.target.from.date)}
          y1={y(h.target.from.saved)}
          x2={x(h.target.to.date)}
          y2={y(h.target.to.saved)}
          className="rob-trend-target"
        />
        <path d={d} className="rob-trend-line" />
        <circle cx={x(last.date)} cy={y(last.saved)} r={5} className="rob-trend-dot">
          <title>{`${gbp(last.saved)} on ${prettyDate(last.date)}`}</title>
        </circle>
        <text x={P.l} y={H - 5} className="rob-chart-label">{prettyDate(setOn)}</text>
        <text x={W - P.r} y={H - 5} className="rob-chart-label" textAnchor="end">{prettyDate(goal.by)}</text>
      </svg>
      <div className="rob-trend-foot">
        <span>
          <b>{gbp(h.saved)}</b> of {gbp(goal.amount)} · <span className={h.onPace ? 'rob-trend-ok' : undefined}>{pace}</span>
        </span>
        <span className="rob-trend-legend" aria-hidden="true">
          <i className="rob-key rob-key-saved" /> saved <i className="rob-key rob-key-target" /> pace
        </span>
      </div>
    </div>
  );
}
