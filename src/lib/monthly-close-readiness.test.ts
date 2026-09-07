import assert from "node:assert/strict";
import test from "node:test";
import { calculateMonthlyCloseReadiness } from "./monthly-close-readiness.ts";

const readyInput = {
  paidAsExpectedCount: 4,
  amountMismatchCount: 0,
  unconfirmedCount: 0,
  unmatchedPaymentCount: 0,
  paymentCount: 4,
  organizedPaymentCount: 4,
  renewalDecisionDueCount: 2,
  renewalDecisionCompletedCount: 2,
};

test("全確認が完了していれば準備度100で締め可能になる", () => {
  assert.deepEqual(calculateMonthlyCloseReadiness(readyInput), {
    score: 100,
    ready: true,
    unresolvedCount: 0,
    reconciliationPercent: 100,
    organizationPercent: 100,
    renewalDecisionPercent: 100,
    issues: [],
  });
});

test("未確認・差異・未整理・判断待ちを個別の未解決項目にする", () => {
  const result = calculateMonthlyCloseReadiness({
    ...readyInput,
    paidAsExpectedCount: 1,
    amountMismatchCount: 1,
    unconfirmedCount: 1,
    unmatchedPaymentCount: 1,
    organizedPaymentCount: 2,
    renewalDecisionCompletedCount: 1,
  });
  assert.equal(result.ready, false);
  assert.equal(result.unresolvedCount, 6);
  assert.equal(result.reconciliationPercent, 25);
  assert.equal(result.organizationPercent, 50);
  assert.equal(result.renewalDecisionPercent, 50);
  assert.equal(result.score, 42);
  assert.deepEqual(result.issues.map((issue) => issue.code), [
    "UNCONFIRMED_PAYMENT",
    "AMOUNT_MISMATCH",
    "UNMATCHED_PAYMENT",
    "UNORGANIZED_PAYMENT",
    "PENDING_RENEWAL_DECISION",
  ]);
});

test("対象データがない観点は未達ではなく確認不要として100にする", () => {
  const result = calculateMonthlyCloseReadiness({
    paidAsExpectedCount: 0,
    amountMismatchCount: 0,
    unconfirmedCount: 0,
    unmatchedPaymentCount: 0,
    paymentCount: 0,
    organizedPaymentCount: 0,
    renewalDecisionDueCount: 0,
    renewalDecisionCompletedCount: 0,
  });
  assert.equal(result.score, 100);
  assert.equal(result.ready, true);
});

test("不正な負数や過剰な完了件数でも割合を0から100に収める", () => {
  const result = calculateMonthlyCloseReadiness({
    ...readyInput,
    paidAsExpectedCount: -1,
    unconfirmedCount: 1,
    paymentCount: 1,
    organizedPaymentCount: 10,
    renewalDecisionDueCount: 1,
    renewalDecisionCompletedCount: 10,
  });
  assert.equal(result.reconciliationPercent, 0);
  assert.equal(result.organizationPercent, 100);
  assert.equal(result.renewalDecisionPercent, 100);
});
