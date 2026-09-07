import { countUsageInRecentDays, japanCalendarDate, shiftCalendarDays } from "./subscription-usage.ts";

export const WEEKLY_REVIEW_DAYS = 7;
export const WEEKLY_USAGE_RANGES = [
  "ZERO",
  "ONE_TWO",
  "THREE_FIVE",
  "SIX_SEVEN",
] as const;

export type WeeklyUsageRange = (typeof WEEKLY_USAGE_RANGES)[number];

export const weeklyUsageRangeOptions: Array<{
  value: WeeklyUsageRange;
  label: string;
}> = [
  { value: "ZERO", label: "0日" },
  { value: "ONE_TWO", label: "1〜2日" },
  { value: "THREE_FIVE", label: "3〜5日" },
  { value: "SIX_SEVEN", label: "6〜7日" },
];

export type WeeklyReviewInput = {
  lastReviewedAt: Date | null;
  usedDates: Date[];
  weeklyReviewedAt?: Date | null;
};

export function needsWeeklyReview(input: WeeklyReviewInput, now = new Date()): boolean {
  const usedRecently = countUsageInRecentDays(input.usedDates, WEEKLY_REVIEW_DAYS, now) > 0;
  const reviewedRecently = input.lastReviewedAt
    ? countUsageInRecentDays([input.lastReviewedAt], WEEKLY_REVIEW_DAYS, now) > 0
    : false;
  const answeredThisWeek = input.weeklyReviewedAt
    ? input.weeklyReviewedAt.getTime() === startOfJapanWeek(now).getTime()
    : false;

  return !usedRecently && !reviewedRecently && !answeredThisWeek;
}

export function startOfJapanWeek(now = new Date()): Date {
  const today = japanCalendarDate(now);
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  return shiftCalendarDays(today, -daysSinceMonday);
}
