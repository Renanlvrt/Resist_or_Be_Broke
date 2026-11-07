/** Round to pennies to avoid float drift (412.5 - 15.3 …). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "£12", "£12.50", "-£3.20" */
export function gbp(n: number): string {
  const v = round2(n);
  const abs = Math.abs(v);
  const s = Number.isInteger(abs) ? abs.toString() : abs.toFixed(2);
  return `${v < 0 ? '-' : ''}£${s}`;
}
