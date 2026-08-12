import { MILLISECONDS_PER_DAY, monthlyAmount } from "./billing.ts";
import { japanCalendarDate, shiftCalendarDays } from "./subscription-usage.ts";

export const UNUSED_NOTIFICATION_MILESTONES = [30, 60, 90] as const;

export type UnusedNotificationMilestone = {
  days: (typeof UNUSED_NOTIFICATION_MILESTONES)[number];
  targetDate: Date;
};

export function unusedNotificationMilestone(
  input: { createdAt: Date; lastUsedAt?: Date | null },
  now = new Date(),
): UnusedNotificationMilestone | null {
  const createdAt = japanCalendarDate(input.createdAt);
  const lastUsedAt = input.lastUsedAt ? japanCalendarDate(input.lastUsedAt) : null;
  const referenceDate = lastUsedAt && lastUsedAt > createdAt ? lastUsedAt : createdAt;
  const today = japanCalendarDate(now);
  const unusedDays = Math.max(0, Math.floor((today.getTime() - referenceDate.getTime()) / MILLISECONDS_PER_DAY));
  const milestone = [...UNUSED_NOTIFICATION_MILESTONES].reverse().find((days) => unusedDays >= days);

  return milestone ? { days: milestone, targetDate: shiftCalendarDays(referenceDate, milestone) } : null;
}

export function priceIncreaseRegisteredToday(
  input: {
    currentPrice: number;
    currentBillingCycle: string;
    currentCustomCycleDays?: number | null;
    previousPrice: number;
    previousBillingCycle: string;
    previousCustomCycleDays?: number | null;
    effectiveFrom: Date;
  },
  now = new Date(),
) {
  const currentMonthly = monthlyAmount(input.currentPrice, input.currentBillingCycle, input.currentCustomCycleDays);
  const previousMonthly = monthlyAmount(input.previousPrice, input.previousBillingCycle, input.previousCustomCycleDays);
  const registeredToday = japanCalendarDate(input.effectiveFrom).getTime() === japanCalendarDate(now).getTime();

  return registeredToday && currentMonthly > previousMonthly
    ? { currentMonthly, previousMonthly, increase: currentMonthly - previousMonthly }
    : null;
}
