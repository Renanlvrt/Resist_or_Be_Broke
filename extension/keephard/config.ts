/** KeepHard voice integration flags (frontend teammate: flip here, nothing else to delete). */
export const KEEPHARD_CONFIG = {
  /** On amazon.co.uk SHOE product pages the live voice flow is the primary one:
   *  Pocket's older Add-to-Basket / Buy-Now interception popup is skipped there.
   *  Set false to restore the old popup on shoe pages too. */
  voicePrimaryOnShoePages: true,
  /** Dashboard auto-closes this long after it opens for the "impact" beat (ms). */
  impactDashboardMs: 8000,
};
