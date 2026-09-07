export type MonthlyCloseReadinessInput = {
  paidAsExpectedCount: number;
  amountMismatchCount: number;
  unconfirmedCount: number;
  unmatchedPaymentCount: number;
  paymentCount: number;
  organizedPaymentCount: number;
  renewalDecisionDueCount: number;
  renewalDecisionCompletedCount: number;
};

export type MonthlyCloseReadinessIssueCode =
  | "UNCONFIRMED_PAYMENT"
  | "AMOUNT_MISMATCH"
  | "UNMATCHED_PAYMENT"
  | "UNORGANIZED_PAYMENT"
  | "PENDING_RENEWAL_DECISION";

export type MonthlyCloseReadinessIssue = {
  code: MonthlyCloseReadinessIssueCode;
  count: number;
  label: string;
};

export type MonthlyCloseReadiness = {
  score: number;
  ready: boolean;
  unresolvedCount: number;
  reconciliationPercent: number;
  organizationPercent: number;
  renewalDecisionPercent: number;
  issues: MonthlyCloseReadinessIssue[];
};

function count(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function completionPercent(completed: number, total: number) {
  const safeTotal = count(total);
  if (safeTotal === 0) return 100;
  return Math.round(Math.min(count(completed), safeTotal) / safeTotal * 100);
}

export function calculateMonthlyCloseReadiness(
  input: MonthlyCloseReadinessInput,
): MonthlyCloseReadiness {
  const paidAsExpectedCount = count(input.paidAsExpectedCount);
  const amountMismatchCount = count(input.amountMismatchCount);
  const unconfirmedCount = count(input.unconfirmedCount);
  const unmatchedPaymentCount = count(input.unmatchedPaymentCount);
  const paymentCount = count(input.paymentCount);
  const organizedPaymentCount = count(input.organizedPaymentCount);
  const renewalDecisionDueCount = count(input.renewalDecisionDueCount);
  const renewalDecisionCompletedCount = count(input.renewalDecisionCompletedCount);
  const reconciliationTotal = paidAsExpectedCount
    + amountMismatchCount
    + unconfirmedCount
    + unmatchedPaymentCount;
  const reconciliationPercent = completionPercent(
    paidAsExpectedCount,
    reconciliationTotal,
  );
  const organizationPercent = completionPercent(
    organizedPaymentCount,
    paymentCount,
  );
  const renewalDecisionPercent = completionPercent(
    renewalDecisionCompletedCount,
    renewalDecisionDueCount,
  );
  const unorganizedPaymentCount = Math.max(0, paymentCount - organizedPaymentCount);
  const pendingRenewalDecisionCount = Math.max(
    0,
    renewalDecisionDueCount - renewalDecisionCompletedCount,
  );
  const issues: MonthlyCloseReadinessIssue[] = [
    unconfirmedCount > 0
      ? { code: "UNCONFIRMED_PAYMENT" as const, count: unconfirmedCount, label: `支払い未確認が${unconfirmedCount}件あります。` }
      : null,
    amountMismatchCount > 0
      ? { code: "AMOUNT_MISMATCH" as const, count: amountMismatchCount, label: `予定額と異なる支払いが${amountMismatchCount}件あります。` }
      : null,
    unmatchedPaymentCount > 0
      ? { code: "UNMATCHED_PAYMENT" as const, count: unmatchedPaymentCount, label: `請求予定と結び付かない支払いが${unmatchedPaymentCount}件あります。` }
      : null,
    unorganizedPaymentCount > 0
      ? { code: "UNORGANIZED_PAYMENT" as const, count: unorganizedPaymentCount, label: `科目または証憑が未整理の支払いが${unorganizedPaymentCount}件あります。` }
      : null,
    pendingRenewalDecisionCount > 0
      ? { code: "PENDING_RENEWAL_DECISION" as const, count: pendingRenewalDecisionCount, label: `更新判断待ちの契約が${pendingRenewalDecisionCount}件あります。` }
      : null,
  ].filter((issue): issue is MonthlyCloseReadinessIssue => issue !== null);
  const unresolvedCount = issues.reduce((total, issue) => total + issue.count, 0);

  return {
    score: Math.round(
      (reconciliationPercent + organizationPercent + renewalDecisionPercent) / 3,
    ),
    ready: unresolvedCount === 0,
    unresolvedCount,
    reconciliationPercent,
    organizationPercent,
    renewalDecisionPercent,
    issues,
  };
}
