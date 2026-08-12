export const JAPAN_TIME_ZONE = "Asia/Tokyo";
export const DAYS_IN_USAGE_WEEK = 7;
export const DAYS_IN_USAGE_MONTH = 30;
export const DAYS_IN_USAGE_QUARTER = 90;
export const DAYS_IN_USAGE_YEAR = 365;

export type UsagePeriodKey = "today" | "week" | "month" | "days30" | "days90" | "days365";

export type UsagePeriod = {
  key: UsagePeriodKey;
  label: string;
  start: Date;
  end: Date;
};

type JapanDateParts = { year: number; month: number; day: number };

function japanDateParts(value: Date): JapanDateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JAPAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const partValue = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);

  return { year: partValue("year"), month: partValue("month"), day: partValue("day") };
}

function dateFromJapanParts({ year, month, day }: JapanDateParts): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

export function japanCalendarDate(value = new Date()): Date {
  return dateFromJapanParts(japanDateParts(value));
}

export function shiftCalendarDays(value: Date, days: number): Date {
  const shifted = new Date(value);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

export function startOfJapanMonth(value = new Date()): Date {
  const { year, month } = japanDateParts(value);
  return dateFromJapanParts({ year, month, day: 1 });
}

export function buildUsagePeriods(now = new Date()): UsagePeriod[] {
  const today = japanCalendarDate(now);
  const tomorrow = shiftCalendarDays(today, 1);
  const startOfWeek = shiftCalendarDays(today, -(DAYS_IN_USAGE_WEEK - 1));

  return [
    { key: "today", label: "今日", start: today, end: tomorrow },
    { key: "week", label: "今週", start: startOfWeek, end: tomorrow },
    { key: "month", label: "今月", start: startOfJapanMonth(now), end: tomorrow },
    { key: "days30", label: "過去30日", start: shiftCalendarDays(today, -(DAYS_IN_USAGE_MONTH - 1)), end: tomorrow },
    { key: "days90", label: "過去90日", start: shiftCalendarDays(today, -(DAYS_IN_USAGE_QUARTER - 1)), end: tomorrow },
    { key: "days365", label: "過去365日", start: shiftCalendarDays(today, -(DAYS_IN_USAGE_YEAR - 1)), end: tomorrow },
  ];
}

export function countUsageByPeriod(usedDates: Date[], now = new Date()): Record<UsagePeriodKey, number> {
  const periods = buildUsagePeriods(now);
  const emptyCounts: Record<UsagePeriodKey, number> = { today: 0, week: 0, month: 0, days30: 0, days90: 0, days365: 0 };

  return periods.reduce<Record<UsagePeriodKey, number>>((counts, period) => {
    counts[period.key] = usedDates.filter((usedDate) => usedDate >= period.start && usedDate < period.end).length;
    return counts;
  }, emptyCounts);
}

export function countUsageInRecentDays(usedDates: Date[], days: number, now = new Date()): number {
  const wholeDays = Math.max(1, Math.floor(days));
  const today = japanCalendarDate(now);
  const start = shiftCalendarDays(today, -(wholeDays - 1));
  const end = shiftCalendarDays(today, 1);
  return usedDates.filter((usedDate) => usedDate >= start && usedDate < end).length;
}
