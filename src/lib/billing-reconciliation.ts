import {
  billingOccurrencesInRange,
  MILLISECONDS_PER_DAY,
} from "./billing.ts";
import { japanCalendarDate } from "./subscription-usage.ts";

export const BILLING_RECONCILIATION_MATCH_WINDOW_DAYS = 7;

export type BillingReconciliationStatus =
  | "PAID_AS_EXPECTED"
  | "AMOUNT_MISMATCH"
  | "UNCONFIRMED"
  | "UPCOMING";

export type BillingReconciliationSubscription = {
  id: string;
  name: string;
  price: number;
  billingCycle: string;
  customCycleDays: number | null;
  nextBillingDate: Date;
};

export type BillingReconciliationPayment = {
  id: string;
  subscriptionId: string;
  amount: number;
  paidAt: Date;
};

export type BillingReconciliationItem = {
  id: string;
  subscriptionId: string;
  subscriptionName: string;
  occurrenceAt: Date;
  expectedAmount: number;
  paymentId: string | null;
  paidAt: Date | null;
  paidAmount: number | null;
  difference: number | null;
  status: BillingReconciliationStatus;
};

export type BillingReconciliationSummary = {
  expectedCount: number;
  expectedAmount: number;
  recordedAmount: number;
  amountDifference: number;
  paidAsExpectedCount: number;
  amountMismatchCount: number;
  unconfirmedCount: number;
  upcomingCount: number;
  unmatchedPaymentCount: number;
};

function calendarDayDistance(left: Date, right: Date) {
  return Math.abs(
    japanCalendarDate(left).getTime() - japanCalendarDate(right).getTime(),
  ) / MILLISECONDS_PER_DAY;
}

function isInRange(value: Date, start: Date, end: Date) {
  const day = japanCalendarDate(value);
  return day >= start && day < end;
}

export function reconcileBillingPeriod({
  subscriptions,
  payments,
  rangeStart,
  rangeEnd,
  now = new Date(),
}: {
  subscriptions: BillingReconciliationSubscription[];
  payments: BillingReconciliationPayment[];
  rangeStart: Date;
  rangeEnd: Date;
  now?: Date;
}) {
  const start = japanCalendarDate(rangeStart);
  const end = japanCalendarDate(rangeEnd);
  const today = japanCalendarDate(now);
  const usedPaymentIds = new Set<string>();
  const items: BillingReconciliationItem[] = [];

  for (const subscription of subscriptions) {
    const subscriptionPayments = payments
      .filter((payment) => payment.subscriptionId === subscription.id)
      .sort((left, right) => left.paidAt.getTime() - right.paidAt.getTime());
    const occurrences = billingOccurrencesInRange(
      subscription.nextBillingDate,
      subscription.billingCycle,
      subscription.customCycleDays,
      start,
      end,
    );

    for (const occurrenceAt of occurrences) {
      const payment = subscriptionPayments
        .filter((candidate) => !usedPaymentIds.has(candidate.id))
        .map((candidate) => ({
          candidate,
          distance: calendarDayDistance(candidate.paidAt, occurrenceAt),
        }))
        .filter(({ distance }) => distance <= BILLING_RECONCILIATION_MATCH_WINDOW_DAYS)
        .sort((left, right) =>
          left.distance - right.distance
          || left.candidate.paidAt.getTime() - right.candidate.paidAt.getTime()
        )[0]?.candidate;

      if (payment) usedPaymentIds.add(payment.id);
      const difference = payment ? payment.amount - subscription.price : null;
      const status: BillingReconciliationStatus = payment
        ? difference === 0
          ? "PAID_AS_EXPECTED"
          : "AMOUNT_MISMATCH"
        : occurrenceAt <= today
          ? "UNCONFIRMED"
          : "UPCOMING";

      items.push({
        id: `${subscription.id}:${occurrenceAt.toISOString().slice(0, 10)}`,
        subscriptionId: subscription.id,
        subscriptionName: subscription.name,
        occurrenceAt,
        expectedAmount: subscription.price,
        paymentId: payment?.id ?? null,
        paidAt: payment?.paidAt ?? null,
        paidAmount: payment?.amount ?? null,
        difference,
        status,
      });
    }
  }

  items.sort((left, right) =>
    left.occurrenceAt.getTime() - right.occurrenceAt.getTime()
    || left.subscriptionName.localeCompare(right.subscriptionName, "ja")
  );

  const recordedPayments = payments.filter((payment) =>
    isInRange(payment.paidAt, start, end)
  );
  const unmatchedPayments = recordedPayments.filter(
    (payment) => !usedPaymentIds.has(payment.id),
  );
  const expectedAmount = items.reduce(
    (total, item) => total + item.expectedAmount,
    0,
  );
  const recordedAmount = recordedPayments.reduce(
    (total, payment) => total + payment.amount,
    0,
  );
  const summary: BillingReconciliationSummary = {
    expectedCount: items.length,
    expectedAmount,
    recordedAmount,
    amountDifference: recordedAmount - expectedAmount,
    paidAsExpectedCount: items.filter((item) => item.status === "PAID_AS_EXPECTED").length,
    amountMismatchCount: items.filter((item) => item.status === "AMOUNT_MISMATCH").length,
    unconfirmedCount: items.filter((item) => item.status === "UNCONFIRMED").length,
    upcomingCount: items.filter((item) => item.status === "UPCOMING").length,
    unmatchedPaymentCount: unmatchedPayments.length,
  };

  return { items, unmatchedPayments, summary };
}
