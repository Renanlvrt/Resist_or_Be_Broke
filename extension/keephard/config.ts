/** KeepHard voice integration flags (frontend teammate: flip here, nothing else to delete). */
export const KEEPHARD_CONFIG = {
  /** On amazon.co.uk SHOE product pages the live voice flow is the primary one:
   *  Pocket's older Add-to-Basket / Buy-Now interception popup is skipped there.
   *  Set false to restore the old popup on shoe pages too. */
  voicePrimaryOnShoePages: true,
  /** After a verdict, open Pocket's dashboard with the goal-impact animation (silent). OFF for the simplified demo:
   *  verdict line -> cheaper-pair card -> countdown -> redirect. The dashboard then opens only by the user's corner hover. */
  dashboardBeat: false,
  /** Dashboard auto-closes this long after it opens for the "impact" beat (ms). */
  impactDashboardMs: 8000,
};
