import { japanCalendarDate } from "./subscription-usage.ts";

export const PAYMENT_TREND_MONTH_COUNT = 12;
export const PAYMENT_TREND_DRIVER_LIMIT = 5;
const MIN_PAYMENT_TREND_YEAR = 2000;

export type PaymentTrendItem = {
  amount: number;
  paidAt: Date;
  subscriptionNameSnapshot: string;
  categoryNameSnapshot: string | null;
};

export type PaymentTrendMonth = {
  month: number;
  currentAmount: number;
  previousAmount: number;
  difference: number;
};

export type PaymentTrendDriver = {
  name: string;
  category: string;
  currentAmount: number;
  previousAmount: number;
  difference: number;
  kind: "NEW" | "ENDED" | "INCREASE" | "DECREASE";
};

export type PaymentYearComparison = {
  year: number;
  previousYear: number;
  comparableMonthCount: number;
  currentAmount: number;
  previousAmount: number;
  difference: number;
  changePercent: number | null;
  annualProjection: number;
  months: PaymentTrendMonth[];
  increases: PaymentTrendDriver[];
  decreases: PaymentTrendDriver[];
};

function japanYearMonth(value: Date) {
  const date = japanCalendarDate(value);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function resolvePaymentTrendYear(value: string | undefined, now = new Date()) {
  const currentYear = japanYearMonth(now).year;
  if (!value || !/^\d{4}$/.test(value)) return currentYear;
  const year = Number(value);
  return year >= MIN_PAYMENT_TREND_YEAR && year <= currentYear ? year : currentYear;
}

function sum(items: PaymentTrendItem[]) {
  return items.reduce((total, item) => total + item.amount, 0);
}

function driverKind(currentAmount: number, previousAmount: number): PaymentTrendDriver["kind"] {
  if (previousAmount === 0) return "NEW";
  if (currentAmount === 0) return "ENDED";
  return currentAmount > previousAmount ? "INCREASE" : "DECREASE";
}

export function buildPaymentYearComparison(
  items: PaymentTrendItem[],
  year: number,
  now = new Date(),
): PaymentYearComparison {
  const currentPeriod = japanYearMonth(now);
  const comparableMonthCount = year === currentPeriod.year
    ? currentPeriod.month
    : PAYMENT_TREND_MONTH_COUNT;
  const previousYear = year - 1;
  const datedItems = items.map((item) => ({ item, ...japanYearMonth(item.paidAt) }));
  const months = Array.from({ length: PAYMENT_TREND_MONTH_COUNT }, (_, index) => {
    const month = index + 1;
    const currentAmount = sum(datedItems
      .filter((entry) => entry.year === year && entry.month === month)
      .map((entry) => entry.item));
    const previousAmount = sum(datedItems
      .filter((entry) => entry.year === previousYear && entry.month === month)
      .map((entry) => entry.item));
    return { month, currentAmount, previousAmount, difference: currentAmount - previousAmount };
  });
  const comparableMonths = months.filter((entry) => entry.month <= comparableMonthCount);
  const currentAmount = comparableMonths.reduce((total, entry) => total + entry.currentAmount, 0);
  const previousAmount = comparableMonths.reduce((total, entry) => total + entry.previousAmount, 0);
  const difference = currentAmount - previousAmount;
  const changePercent = previousAmount === 0 ? null : Math.round((difference / previousAmount) * 100);
  const annualProjection = year === currentPeriod.year
    ? Math.round((currentAmount / comparableMonthCount) * PAYMENT_TREND_MONTH_COUNT)
    : currentAmount;

  const comparableItems = datedItems.filter((entry) =>
    (entry.year === year || entry.year === previousYear)
    && entry.month <= comparableMonthCount,
  );
  const driverMap = comparableItems.reduce<Map<string, { category: string; currentAmount: number; previousAmount: number }>>(
    (map, entry) => {
      const name = entry.item.subscriptionNameSnapshot;
      const current = map.get(name) ?? {
        category: entry.item.categoryNameSnapshot ?? "未分類",
        currentAmount: 0,
        previousAmount: 0,
      };
      if (entry.year === year) current.currentAmount += entry.item.amount;
      else current.previousAmount += entry.item.amount;
      map.set(name, current);
      return map;
    },
    new Map(),
  );
  const drivers = [...driverMap.entries()]
    .map(([name, amounts]) => ({
      name,
      category: amounts.category,
      currentAmount: amounts.currentAmount,
      previousAmount: amounts.previousAmount,
      difference: amounts.currentAmount - amounts.previousAmount,
      kind: driverKind(amounts.currentAmount, amounts.previousAmount),
    }))
    .filter((driver) => driver.difference !== 0);
  const increases = drivers
    .filter((driver) => driver.difference > 0)
    .sort((a, b) => b.difference - a.difference || a.name.localeCompare(b.name, "ja"))
    .slice(0, PAYMENT_TREND_DRIVER_LIMIT);
  const decreases = drivers
    .filter((driver) => driver.difference < 0)
    .sort((a, b) => a.difference - b.difference || a.name.localeCompare(b.name, "ja"))
    .slice(0, PAYMENT_TREND_DRIVER_LIMIT);

  return {
    year,
    previousYear,
    comparableMonthCount,
    currentAmount,
    previousAmount,
    difference,
    changePercent,
    annualProjection,
    months,
    increases,
    decreases,
  };
}
