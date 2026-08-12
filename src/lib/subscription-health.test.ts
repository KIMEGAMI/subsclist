import assert from "node:assert/strict";
import test from "node:test";
import { calculateSubscriptionHealth } from "./subscription-health.ts";

test("利用実績が不足しても不当に減点しない", () => {
  const result = calculateSubscriptionHealth({
    hasUsageData: false,
    unusedThisMonthCount: 0,
    unusedNinetyDaysCount: 0,
    duplicateCategoryCount: 0,
    budgetExceeded: false,
    cancellationCandidateCount: 0,
  });

  assert.equal(result.score, 100);
  assert.equal(result.label, "非常に良好");
  assert.match(result.reasons[0] ?? "", /利用実績/);
});

test("未使用・予算超過・重複を理由付きで減点する", () => {
  const result = calculateSubscriptionHealth({
    hasUsageData: true,
    unusedThisMonthCount: 2,
    unusedNinetyDaysCount: 1,
    duplicateCategoryCount: 2,
    budgetExceeded: true,
    cancellationCandidateCount: 1,
  });

  assert.equal(result.score, 49);
  assert.equal(result.label, "無駄あり");
  assert.equal(result.reasons.length, 5);
});
