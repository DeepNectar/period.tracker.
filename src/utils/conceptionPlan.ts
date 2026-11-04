// Pure logic for the "Future Birthday Calculator" — babyMed-style reverse
// planning: given a TARGET birth date, estimate the conception window and the
// days most likely to result in a baby born on (or around) that date.
//
// Medical basis used by these calculators:
//  • A full-term pregnancy is ~266 days (38 weeks) from conception/ovulation.
//  • Ovulation typically happens ~14 days after the first day of the last
//    menstrual period (LMP), so pregnancy is dated from LMP (~280 days total).
//  • The fertile window is the ~5 days before ovulation plus ovulation day
//    (sperm can live up to 5 days; the egg lives ~12-24 hours).

import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { fromKey, toKey } from './tools';

/** Days from conception to an expected due date (38 weeks). */
export const GESTATION_DAYS_FROM_CONCEPTION = 266;
/** Days from LMP to an expected due date (40 weeks). */
export const GESTATION_DAYS_FROM_LMP = 280;

export type TermWeek = 37 | 38 | 39 | 40;

export interface ConceptionPlan {
  targetBirthDate: string;        // YYYY-MM-DD key
  /** Estimated conception date for each term length. */
  conceptionDates: { week: TermWeek; label: string; dateKey: string }[];
  /** Best-guess single conception date (39-week term). */
  bestConceptionKey: string;
  /** Fertile window around the best-guess ovulation (cycle day 12-17 ish). */
  fertileWindow: { startKey: string; endKey: string };
  /** Recommended intercourse dates centred on ovulation. */
  sexDayKeys: string[];
  /** Expected first day of last menstrual period (for cycle tracking). */
  lmpKey: string;
  /** Due-date check: how many days early/late a target is vs 40w. */
  notes: string[];
}

const TERM_WEEKS: { week: TermWeek; label: string }[] = [
  { week: 40, label: '40 weeks (full term)' },
  { week: 39, label: '39 weeks' },
  { week: 38, label: '38 weeks' },
  { week: 37, label: '37 weeks (early term)' },
];

/**
 * Build a conception plan backwards from a desired birth date.
 * `targetKey` may be in the past or future — we only do date math.
 */
export function buildConceptionPlan(targetKey: string): ConceptionPlan {
  const target = fromKey(targetKey);

  const conceptionDates = TERM_WEEKS.map(({ week, label }) => ({
    week,
    label,
    dateKey: toKey(addDays(target, -(week * 7))),
  }));

  // Best guess: 39-week term ≈ 273 days from conception.
  const best = addDays(target, -273);
  const bestConceptionKey = toKey(best);

  // Fertile window: 5 days before ovulation through 1 day after.
  const fertileStart = addDays(best, -5);
  const fertileEnd = addDays(best, 1);

  // Suggested intercourse days: every other day across the window,
  // guaranteeing fresh sperm is present at ovulation.
  const sexDayKeys: string[] = [];
  for (let d = fertileStart; d <= fertileEnd; d = addDays(d, 2)) {
    sexDayKeys.push(toKey(d));
  }
  // Always include ovulation day itself.
  if (!sexDayKeys.includes(bestConceptionKey)) sexDayKeys.push(bestConceptionKey);

  // Last menstrual period ≈ 14 days before ovulation (estimate).
  const lmpKey = toKey(addDays(best, -14));

  const notes: string[] = [];
  const diffFromToday = differenceInCalendarDays(target, new Date());
  if (diffFromToday < 0) {
    notes.push('This birth date is in the past — pick a future date to plan.');
  } else if (diffFromToday > 320) {
    notes.push(
      `That's ${diffFromToday} days away — start trying about ${Math.max(
        1,
        diffFromToday - 273
      )} days from now.`
    );
  }
  return {
    targetBirthDate: targetKey,
    conceptionDates,
    bestConceptionKey,
    fertileWindow: { startKey: toKey(fertileStart), endKey: toKey(fertileEnd) },
    sexDayKeys,
    lmpKey,
    notes,
  };
}

/** Friendly weekday+date formatting for display lists. */
export function formatPlanDate(key: string): string {
  return format(fromKey(key), 'EEE, MMM d, yyyy');
}
