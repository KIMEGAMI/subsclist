import { nextBillingOccurrence } from "@/lib/billing";

export type ForecastSubscription = {
  price: number;
  billingCycle: string;
  customCycleDays?: number | null;
  nextBillingDate: Date;
};

export type ForecastMonth = {
  key: string;
  label: string;
  total: number;
  payments: number;
};

function monthStart(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function yearMonthKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function addMonthsClamped(value: Date, amount: number) {
  const result = new Date(value);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + amount);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

export function buildForecastSeries(subscriptions: ForecastSubscription[], months = 12) {
  const start = monthStart(new Date());
  const endExclusive = addMonthsClamped(start, months);
  const series = Array.from({ length: months }, (_, index) => {
    const cursor = addMonthsClamped(start, index);
    return {
      key: yearMonthKey(cursor),
      label: `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`,
      total: 0,
      payments: 0,
    } satisfies ForecastMonth;
  });
  const buckets = new Map(series.map((item) => [item.key, item]));

  for (const subscription of subscriptions) {
    let occurrence = nextBillingOccurrence(
      subscription.nextBillingDate,
      subscription.billingCycle,
      subscription.customCycleDays,
      start,
    );
    if (Number.isNaN(occurrence.getTime())) continue;

    while (occurrence < endExclusive) {
      const bucket = buckets.get(yearMonthKey(occurrence));
      if (bucket) {
        bucket.total += subscription.price;
        bucket.payments += 1;
      }
      const nextReference = new Date(occurrence);
      nextReference.setDate(nextReference.getDate() + 1);
      occurrence = nextBillingOccurrence(
        subscription.nextBillingDate,
        subscription.billingCycle,
        subscription.customCycleDays,
        nextReference,
      );
    }
  }

  return series;
}
