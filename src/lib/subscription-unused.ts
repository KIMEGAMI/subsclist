export const UNUSED_USAGE_WINDOWS = [30, 60, 90] as const;

export type UnusedSubscriptionInput = {
  id: string;
  name: string;
  createdAt: Date;
  usageDays30: number;
  usageDays60: number;
  usageDays90: number;
};

export type UnusedSubscriptionResult = {
  id: string;
  name: string;
  unusedDays: (typeof UNUSED_USAGE_WINDOWS)[number];
  usageDays: number;
};

function calendarDaysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000));
}

export function detectUnusedSubscriptions(items: UnusedSubscriptionInput[], now = new Date()): UnusedSubscriptionResult[] {
  return items.flatMap((item) => {
    const daysSinceRegistration = calendarDaysBetween(item.createdAt, now);
    const matchingWindow = [...UNUSED_USAGE_WINDOWS].reverse().find((windowDays) => {
      const usageDays = windowDays === 90 ? item.usageDays90 : windowDays === 60 ? item.usageDays60 : item.usageDays30;
      return daysSinceRegistration >= windowDays && usageDays === 0;
    });
    if (!matchingWindow) return [];

    const usageDays = matchingWindow === 90 ? item.usageDays90 : matchingWindow === 60 ? item.usageDays60 : item.usageDays30;
    return [{ id: item.id, name: item.name, unusedDays: matchingWindow, usageDays }];
  });
}
