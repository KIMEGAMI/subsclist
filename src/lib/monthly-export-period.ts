import { japanCalendarDate } from "./subscription-usage.ts";

export function monthlyExportPeriod(year: number, month: number) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

export function isFutureMonthlyExportPeriod(
  year: number,
  month: number,
  now = new Date(),
) {
  const current = japanCalendarDate(now);
  return year > current.getUTCFullYear()
    || (year === current.getUTCFullYear() && month > current.getUTCMonth() + 1);
}
