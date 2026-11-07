// Summer holiday goal: separate illustrative projection (not the April chart).
// Baseline: the saved-this-month figure compounds at HOLIDAY_RATE per month from Nov 2026 to Jun 2027 (7 months).
// With the fixed demo £131 that is about £430, i.e. £30 above the £400 target.
export const HOLIDAY = { label: 'Summer holiday', amount: 400, by: '2027-06-30' };
export const HOLIDAY_RATE = 1.185;
export const HOLIDAY_MONTHS = 7;
const r2 = (n: number) => Math.round(n * 100) / 100;
export const holidayBaseline = (saved: number) => r2(saved * Math.pow(HOLIDAY_RATE, HOLIDAY_MONTHS));
/** Projected savings by June if a purchase of `price` is made (0 = skip it). */
export const holidayAfter = (saved: number, price: number) => r2(holidayBaseline(saved) - Math.max(0, price));
export const holidayOnTrack = (projected: number, target = HOLIDAY.amount) => projected >= target;
