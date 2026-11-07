import { gbp, prettyDate, type ForecastPoint } from '@resist/engine';

/** Daily balance to the next income date, with the lowest point marked. Plain SVG, no chart lib. */
export function ForecastChart({ points, lowest }: { points: ForecastPoint[]; lowest: { amount: number; date: string } }) {
  if (points.length < 2) return null;
  const W = 520;
  const H = 180;
  const P = { l: 44, r: 12, t: 12, b: 24 };
  const vals = points.map((p) => p.balance);
  const max = Math.max(...vals, 0);
  const min = Math.min(...vals, 0);
  const x = (i: number) => P.l + (i / (points.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + ((max - v) / (max - min || 1)) * (H - P.t - P.b);
  // step line: balance holds until the next bill
  const d = points.map((p, i) => (i === 0 ? `M${x(0)},${y(p.balance)}` : `H${x(i)} V${y(p.balance)}`)).join(' ');
  const li = points.findIndex((p) => p.date === lowest.date);

  return (
    <svg className="rob-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Balance forecast. Lowest ${gbp(lowest.amount)} on ${prettyDate(lowest.date)}.`}>
      <line x1={P.l} x2={W - P.r} y1={y(0)} y2={y(0)} className="rob-chart-zero" />
      <text x={P.l - 6} y={y(max) + 4} className="rob-chart-label" textAnchor="end">{gbp(Math.round(max))}</text>
      <text x={P.l - 6} y={y(0) + 4} className="rob-chart-label" textAnchor="end">£0</text>
      <path d={d} className="rob-chart-line" />
      {li >= 0 && (
        <g>
          <circle cx={x(li)} cy={y(lowest.amount)} r={4.5} className="rob-chart-low" />
          <text x={x(li)} y={y(lowest.amount) - 9} className="rob-chart-low-label" textAnchor="end">
            {gbp(lowest.amount)} · {prettyDate(lowest.date)}
          </text>
        </g>
      )}
      <text x={P.l} y={H - 6} className="rob-chart-label">{prettyDate(points[0]!.date)}</text>
      <text x={W - P.r} y={H - 6} className="rob-chart-label" textAnchor="end">{prettyDate(points.at(-1)!.date)}</text>
    </svg>
  );
}
