import { monthlyExportPeriod } from "./monthly-export-period.ts";
import { japanCalendarDate } from "./subscription-usage.ts";

const MIN_REPORT_YEAR = 2000;

export type MonthlyReportPeriod = {
  key: string;
  year: number;
  month: number;
  start: Date;
  end: Date;
  previousStart: Date;
  currentKey: string;
  isCurrent: boolean;
};

export function monthlyReportKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function shiftMonthlyReportKey(value: string, amount: number) {
  const [year, month] = value.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + amount, 1));
  return monthlyReportKey(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1);
}

export function resolveMonthlyReportPeriod(
  value: string | undefined,
  now = new Date(),
): MonthlyReportPeriod {
  const today = japanCalendarDate(now);
  const currentYear = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth() + 1;
  const currentKey = monthlyReportKey(currentYear, currentMonth);
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  const requestedYear = match ? Number(match[1]) : currentYear;
  const requestedMonth = match ? Number(match[2]) : currentMonth;
  const valid = requestedYear >= MIN_REPORT_YEAR
    && requestedMonth >= 1
    && requestedMonth <= 12;
  const requestedKey = valid
    ? monthlyReportKey(requestedYear, requestedMonth)
    : currentKey;
  const key = requestedKey <= currentKey ? requestedKey : currentKey;
  const [year, month] = key.split("-").map(Number);
  const period = monthlyExportPeriod(year, month);

  return {
    key,
    year,
    month,
    start: period.start,
    end: period.end,
    previousStart: new Date(Date.UTC(year, month - 2, 1)),
    currentKey,
    isCurrent: key === currentKey,
  };
}
