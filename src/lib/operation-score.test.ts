import test from "node:test";
import assert from "node:assert/strict";
import { MONTHLY_CLOSE_SCORE_PENALTY } from "./app-constants.ts";
import { calculateOperationScore } from "./operation-score.ts";

const healthyInput = {
  urgentCount: 0,
  reviewCount: 0,
  lowUsageCount: 0,
  dataQuality: 100,
  monthlyTotal: 10_000,
  monthlyBudget: 12_000,
  monthlyCloseCompleted: true,
};

test("問題がなく月次締めも完了していれば100点になる", () => {
  assert.equal(calculateOperationScore(healthyInput), 100);
});

test("月次締めが未完了なら定義済みの点数を減点する", () => {
  assert.equal(
    calculateOperationScore({ ...healthyInput, monthlyCloseCompleted: false }),
    100 - MONTHLY_CLOSE_SCORE_PENALTY,
  );
});

test("期限、見直し、低利用、データ不足、予算超過の既存ルールを維持する", () => {
  assert.equal(
    calculateOperationScore({
      urgentCount: 1,
      reviewCount: 1,
      lowUsageCount: 1,
      dataQuality: 75,
      monthlyTotal: 12_000,
      monthlyBudget: 10_000,
      monthlyCloseCompleted: true,
    }),
    70,
  );
});

test("減点が100点を超えても0点未満にならない", () => {
  assert.equal(
    calculateOperationScore({
      urgentCount: 100,
      reviewCount: 100,
      lowUsageCount: 100,
      dataQuality: 0,
      monthlyTotal: 100_000,
      monthlyBudget: 1,
      monthlyCloseCompleted: false,
    }),
    0,
  );
});
