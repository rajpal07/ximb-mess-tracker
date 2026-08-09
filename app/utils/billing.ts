/** Mess billing rates, per the XIM mess regulations email. */

// Breakfast 35 + Lunch 82 + Snacks 23 + Dinner 82
export const DAILY_FIXED_COST = 222;

// Biryani / special-item nights carry a surcharge on top of the standard dinner.
export const SPECIAL_DINNER_EXTRA = 35;

// The mess runs roughly four special-item nights per month.
export const SPECIAL_DINNER_DAYS_PER_MONTH = 4;

/**
 * Special-dinner nights to bill for a month, prorated when only part of the
 * month is counted (mess started mid-month, or the month is still running).
 */
export function specialDinnerDays(daysCounted: number, daysInMonth: number): number {
  if (daysCounted <= 0 || daysInMonth <= 0) return 0;
  const share = Math.min(daysCounted, daysInMonth) / daysInMonth;
  return Math.round(SPECIAL_DINNER_DAYS_PER_MONTH * share);
}

/** Special-dinner surcharge for a month, in rupees. */
export function specialDinnerTotal(daysCounted: number, daysInMonth: number): number {
  return specialDinnerDays(daysCounted, daysInMonth) * SPECIAL_DINNER_EXTRA;
}
