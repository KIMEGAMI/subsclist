import { monthlyAmount } from "./billing.ts";
import { businessUseAmount } from "./subscription-business.ts";
import { japanCalendarDate } from "./subscription-usage.ts";

export type MonthlyCloseSubscription = {
  price: number;
  billingCycle: string;
  customCycleDays: number | null;
  lastReviewedAt: Date | null;
  trialEndsAt: Date | null;
  cancellationDeadline: Date | null;
};

export type MonthlyClosePayment = {
  amount: number;
  businessUsePercent: number;
  paidAt: Date;
};

export type MonthlyCloseSummary = {
  year: number;
  month: number;
  start: Date;
  end: Date;
  paidAmount: number;
  businessPaidAmount: number;
  activeMonthlyAmount: number;
  activeSubscriptionCount: number;
  reviewedSubscriptionCount: number;
  deadlineRiskCount: number;
};

export function monthlyClosePeriod(now = new Date()) {
  const calendarDate = japanCalendarDate(now);
  const year = calendarDate.getUTCFullYear();
  const month = calendarDate.getUTCMonth() + 1;
  return {
    year,
    month,
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
    today: calendarDate,
  };
}

function isInPeriod(value: Date | null, start: Date, end: Date) {
  if (!value) return false;
  const calendarDate = japanCalendarDate(value);
  return calendarDate >= start && calendarDate < end;
}

export function summarizeMonthlyClose({
  subscriptions,
  payments,
  now = new Date(),
}: {
  subscriptions: MonthlyCloseSubscription[];
  payments: MonthlyClosePayment[];
  now?: Date;
}): MonthlyCloseSummary {
  const period = monthlyClosePeriod(now);
  const currentPayments = payments.filter((payment) =>
    isInPeriod(payment.paidAt, period.start, period.end),
  );
  const paidAmount = currentPayments.reduce(
    (total, payment) => total + payment.amount,
    0,
  );
  const businessPaidAmount = currentPayments.reduce(
    (total, payment) =>
      total + businessUseAmount(payment.amount, payment.businessUsePercent),
    0,
  );
  const activeMonthlyAmount = Math.round(
    subscriptions.reduce(
      (total, subscription) =>
        total +
        monthlyAmount(
          subscription.price,
          subscription.billingCycle,
          subscription.customCycleDays,
        ),
      0,
    ),
  );
  const reviewedSubscriptionCount = subscriptions.filter((subscription) =>
    isInPeriod(subscription.lastReviewedAt, period.start, period.end),
  ).length;
  const deadlineRiskCount = subscriptions.filter((subscription) =>
    [subscription.trialEndsAt, subscription.cancellationDeadline].some(
      (date) => date && japanCalendarDate(date) >= period.today && japanCalendarDate(date) < period.end,
    ),
  ).length;

  return {
    year: period.year,
    month: period.month,
    start: period.start,
    end: period.end,
    paidAmount,
    businessPaidAmount,
    activeMonthlyAmount,
    activeSubscriptionCount: subscriptions.length,
    reviewedSubscriptionCount,
    deadlineRiskCount,
  };
}
