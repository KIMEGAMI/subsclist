import { monthlyAmount, nextBillingOccurrence } from "./billing.ts";
import { businessUseAmount } from "./subscription-business.ts";
import { japanCalendarDate } from "./subscription-usage.ts";

export const MONTHLY_DIGEST_DAY = 1;
export const MONTHLY_DIGEST_RENEWAL_WINDOW_DAYS = 30;
export const MONTHLY_DIGEST_REVIEW_AFTER_DAYS = 30;

type DigestSubscription = {
  id: string;
  name: string;
  price: number;
  billingCycle: string;
  customCycleDays: number | null;
  nextBillingDate: Date;
  businessUsePercent: number;
  lastReviewedAt: Date | null;
};

type MonthlyOutcomePayment = {
  amount: number;
  businessUsePercent: number;
  paidAt: Date;
};

type MonthlyOutcomeDecision = {
  decidedAt: Date;
};

type MonthlyOutcomeCancellation = {
  price: number;
  billingCycle: string;
  customCycleDays?: number | null;
  cancellationCompletedAt: Date | null;
};

type MonthlyOutcomeClose = {
  year: number;
  month: number;
  readinessScore: number | null;
  unresolvedCount: number | null;
} | null;

export function previousMonthlyOutcomePeriod(referenceDate: Date) {
  const reference = japanCalendarDate(referenceDate);
  const end = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));
  return {
    year: start.getUTCFullYear(),
    month: start.getUTCMonth() + 1,
    start,
    end,
  };
}

export function summarizePreviousMonthlyOutcome({
  payments,
  decisions,
  cancellations,
  monthlyClose,
  referenceDate,
}: {
  payments: MonthlyOutcomePayment[];
  decisions: MonthlyOutcomeDecision[];
  cancellations: MonthlyOutcomeCancellation[];
  monthlyClose: MonthlyOutcomeClose;
  referenceDate: Date;
}) {
  const period = previousMonthlyOutcomePeriod(referenceDate);
  const periodPayments = payments.filter((payment) =>
    payment.paidAt >= period.start && payment.paidAt < period.end
  );
  const periodDecisions = decisions.filter((decision) =>
    decision.decidedAt >= period.start && decision.decidedAt < period.end
  );
  const periodCancellations = cancellations.filter((subscription) =>
    subscription.cancellationCompletedAt
    && subscription.cancellationCompletedAt >= period.start
    && subscription.cancellationCompletedAt < period.end
  );
  const close = monthlyClose?.year === period.year && monthlyClose.month === period.month
    ? monthlyClose
    : null;

  return {
    ...period,
    paymentCount: periodPayments.length,
    paidAmount: periodPayments.reduce((sum, payment) => sum + payment.amount, 0),
    businessPaidAmount: periodPayments.reduce(
      (sum, payment) => sum + businessUseAmount(payment.amount, payment.businessUsePercent),
      0,
    ),
    decisionCount: periodDecisions.length,
    cancellationCount: periodCancellations.length,
    completedMonthlyReduction: Math.round(periodCancellations.reduce(
      (sum, subscription) => sum + monthlyAmount(
        subscription.price,
        subscription.billingCycle,
        subscription.customCycleDays,
      ),
      0,
    )),
    closeRecorded: close !== null,
    readinessScore: close?.readinessScore ?? null,
    unresolvedCount: close?.unresolvedCount ?? null,
  };
}

export function previousMonthlyOutcomeSummaryLines(
  outcome: ReturnType<typeof summarizePreviousMonthlyOutcome>,
) {
  const closeLine = !outcome.closeRecorded
    ? `${outcome.month}月の月次締め: 未実施`
    : outcome.readinessScore === null
      ? `${outcome.month}月の月次締め: 記録あり（旧形式）`
      : `${outcome.month}月の月次締め: 準備度 ${outcome.readinessScore}% / 未解決 ${outcome.unresolvedCount ?? 0}件`;
  return [
    `${outcome.month}月の支払い実績: ${outcome.paidAmount.toLocaleString("ja-JP")}円（${outcome.paymentCount}件） / 仕事利用分: ${outcome.businessPaidAmount.toLocaleString("ja-JP")}円`,
    `${outcome.month}月の更新判断: ${outcome.decisionCount}件 / 解約完了: ${outcome.cancellationCount}件 / 解約完了分の月額換算: ${outcome.completedMonthlyReduction.toLocaleString("ja-JP")}円`,
    closeLine,
  ];
}

export function isMonthlyDigestDay(referenceDate: Date) {
  return referenceDate.getUTCDate() === MONTHLY_DIGEST_DAY;
}

export function summarizeMonthlyDigest({
  subscriptions,
  monthlyBudget,
  referenceDate,
}: {
  subscriptions: DigestSubscription[];
  monthlyBudget: number | null;
  referenceDate: Date;
}) {
  const monthlyCosts = subscriptions.map((subscription) => ({
    subscription,
    amount: monthlyAmount(
      subscription.price,
      subscription.billingCycle,
      subscription.customCycleDays,
    ),
  }));
  const monthlyTotal = Math.round(monthlyCosts.reduce((sum, item) => sum + item.amount, 0));
  const businessMonthlyTotal = Math.round(monthlyCosts.reduce(
    (sum, item) => sum + businessUseAmount(item.amount, item.subscription.businessUsePercent),
    0,
  ));
  const renewalWindowEnd = new Date(referenceDate);
  renewalWindowEnd.setUTCDate(
    renewalWindowEnd.getUTCDate() + MONTHLY_DIGEST_RENEWAL_WINDOW_DAYS,
  );
  const reviewThreshold = new Date(referenceDate);
  reviewThreshold.setUTCDate(
    reviewThreshold.getUTCDate() - MONTHLY_DIGEST_REVIEW_AFTER_DAYS,
  );
  const upcomingRenewalCount = subscriptions.filter((subscription) => {
    const occurrence = nextBillingOccurrence(
      subscription.nextBillingDate,
      subscription.billingCycle,
      subscription.customCycleDays,
      referenceDate,
    );
    return occurrence <= renewalWindowEnd;
  }).length;
  const reviewNeededCount = subscriptions.filter(
    (subscription) => !subscription.lastReviewedAt || subscription.lastReviewedAt < reviewThreshold,
  ).length;
  const highestCost = monthlyCosts.reduce<(typeof monthlyCosts)[number] | null>(
    (highest, item) => !highest || item.amount > highest.amount ? item : highest,
    null,
  );

  return {
    activeCount: subscriptions.length,
    monthlyTotal,
    businessMonthlyTotal,
    budgetDifference: monthlyBudget === null ? null : monthlyBudget - monthlyTotal,
    upcomingRenewalCount,
    reviewNeededCount,
    highestCostSubscription: highestCost
      ? { id: highestCost.subscription.id, name: highestCost.subscription.name, monthlyAmount: Math.round(highestCost.amount) }
      : null,
  };
}
