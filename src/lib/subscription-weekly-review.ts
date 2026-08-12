import { countUsageInRecentDays, japanCalendarDate, shiftCalendarDays } from "./subscription-usage.ts";

export const WEEKLY_REVIEW_DAYS = 7;

export type WeeklyReviewInput = {
  lastReviewedAt: Date | null;
  usedDates: Date[];
};

export function needsWeeklyReview(input: WeeklyReviewInput, now = new Date()): boolean {
  const usedRecently = countUsageInRecentDays(input.usedDates, WEEKLY_REVIEW_DAYS, now) > 0;
  const reviewedRecently = input.lastReviewedAt
    ? countUsageInRecentDays([input.lastReviewedAt], WEEKLY_REVIEW_DAYS, now) > 0
    : false;

  return !usedRecently && !reviewedRecently;
}

export function startOfJapanWeek(now = new Date()): Date {
  const today = japanCalendarDate(now);
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  return shiftCalendarDays(today, -daysSinceMonday);
}
