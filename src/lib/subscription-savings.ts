import { monthlyAmount, MONTHS_PER_YEAR } from "./billing.ts";
import { japanCalendarDate } from "./subscription-usage.ts";

export const SAVINGS_TIMELINE_MONTHS = 12;
const JAPAN_UTC_OFFSET_MS = 9 * 60 * 60 * 1_000;

export type JapanMonthInterval = {
  year: number;
  month: number;
  start: Date;
  end: Date;
};

export function japanMonthInterval(year: number, month: number): JapanMonthInterval {
  const start = new Date(Date.UTC(year, month - 1, 1) - JAPAN_UTC_OFFSET_MS);
  const end = new Date(Date.UTC(year, month, 1) - JAPAN_UTC_OFFSET_MS);
  return { year, month, start, end };
}

export function recentJapanMonthIntervals(referenceDate = new Date(), count = SAVINGS_TIMELINE_MONTHS) {
  const safeCount = Math.max(1, Math.floor(count));
  const reference = japanCalendarDate(referenceDate);
  return Array.from({ length: safeCount }, (_, index) => {
    const monthDate = new Date(Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth() - safeCount + index + 1,
      1,
    ));
    return japanMonthInterval(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1);
  });
}

export type CompletedSubscriptionSaving = {
  price: number;
  billingCycle: string;
  customCycleDays?: number | null;
  cancellationCompletedAt: Date | null;
};

export type SavingAchievement = {
  label: string;
  reached: boolean;
};

export function summarizeCompletedSavings(
  subscriptions: CompletedSubscriptionSaving[],
  year: number,
) {
  const completed = subscriptions.filter(
    (subscription) =>
      subscription.cancellationCompletedAt
      && japanCalendarDate(subscription.cancellationCompletedAt).getUTCFullYear() === year,
  );
  const monthlySaving = completed.reduce(
    (total, subscription) =>
      total +
      monthlyAmount(
        subscription.price,
        subscription.billingCycle,
        subscription.customCycleDays,
      ),
    0,
  );
  const annualSaving = monthlySaving * MONTHS_PER_YEAR;

  return {
    year,
    completedCount: completed.length,
    monthlySaving,
    annualSaving,
    achievements: [
      { label: "初めて整理しました", reached: completed.length > 0 },
      { label: "年間1万円削減", reached: annualSaving >= 10_000 },
      { label: "年間5万円削減", reached: annualSaving >= 50_000 },
      { label: "年間10万円削減", reached: annualSaving >= 100_000 },
    ] satisfies SavingAchievement[],
  };
}

export function buildCompletedSavingsTimeline(
  subscriptions: CompletedSubscriptionSaving[],
  referenceDate = new Date(),
  monthCount = SAVINGS_TIMELINE_MONTHS,
) {
  const safeMonthCount = Math.max(1, Math.floor(monthCount));
  const reference = japanCalendarDate(referenceDate);
  const completed = subscriptions.flatMap((subscription) => {
    if (!subscription.cancellationCompletedAt || subscription.cancellationCompletedAt > referenceDate) return [];
    return [{
      completedMonth: japanCalendarDate(subscription.cancellationCompletedAt),
      monthlySaving: monthlyAmount(
        subscription.price,
        subscription.billingCycle,
        subscription.customCycleDays,
      ),
    }];
  });
  const points = Array.from({ length: safeMonthCount }, (_, index) => {
    const monthOffset = index - safeMonthCount + 1;
    const monthStart = new Date(Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth() + monthOffset,
      1,
    ));
    const monthEnd = new Date(Date.UTC(
      monthStart.getUTCFullYear(),
      monthStart.getUTCMonth() + 1,
      1,
    ));
    const newMonthlySaving = completed
      .filter((item) => item.completedMonth >= monthStart && item.completedMonth < monthEnd)
      .reduce((sum, item) => sum + item.monthlySaving, 0);
    const runRate = completed
      .filter((item) => item.completedMonth < monthEnd)
      .reduce((sum, item) => sum + item.monthlySaving, 0);
    return {
      year: monthStart.getUTCFullYear(),
      month: monthStart.getUTCMonth() + 1,
      newMonthlySaving: Math.round(newMonthlySaving),
      runRate: Math.round(runRate),
    };
  });

  return {
    points,
    currentMonthlyRunRate: points.at(-1)?.runRate ?? 0,
    currentAnnualRunRate: (points.at(-1)?.runRate ?? 0) * MONTHS_PER_YEAR,
    maxRunRate: Math.max(0, ...points.map((point) => point.runRate)),
  };
}
