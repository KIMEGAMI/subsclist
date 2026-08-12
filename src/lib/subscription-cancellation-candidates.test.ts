import assert from "node:assert/strict";
import test from "node:test";
import { detectCancellationCandidates } from "./subscription-cancellation-candidates.ts";

test("候補は理由と年間換算を持ち、契約状態を変更しない", () => {
  const results = detectCancellationCandidates([{
    id: "candidate", name: "候補", monthlyCost: 1500, unusedDays: 60, usageFrequency: "RARELY", priority: "OPTIONAL", duplicateCategory: true, isHighCost: true,
  }], 12);

  assert.equal(results[0]?.score, 13);
  assert.equal(results[0]?.annualSaving, 18000);
  assert.equal(results[0]?.reasons.length, 5);
});

test("判断材料がない契約は候補にしない", () => {
  const results = detectCancellationCandidates([{
    id: "keep", name: "継続", monthlyCost: 500, unusedDays: 0, usageFrequency: "DAILY", priority: "ESSENTIAL", duplicateCategory: false, isHighCost: false,
  }], 12);

  assert.deepEqual(results, []);
});
