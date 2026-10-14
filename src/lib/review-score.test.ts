import assert from "node:assert/strict";
import test from "node:test";
import { calculateReviewScore } from "./review-score.ts";

test("見直しスコアは根拠を伴って0から100に収める", () => {
  const result = calculateReviewScore({ priceIncreased: true, daysSinceLastUse: 45, alternativeAvailable: true, annualDifference: 12000, priority: "OPTIONAL", usageFrequency: "RARELY", businessUsePercent: 0 });
  assert.equal(result.score, 100);
  assert.ok(result.reasons.length >= 4);
});

test("毎日利用する必須の業務サービスは過度に見直し対象にしない", () => {
  const result = calculateReviewScore({ priceIncreased: false, daysSinceLastUse: 1, alternativeAvailable: false, annualDifference: null, priority: "ESSENTIAL", usageFrequency: "DAILY", businessUsePercent: 100 });
  assert.equal(result.score, 0);
});
