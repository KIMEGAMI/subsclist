import assert from "node:assert/strict";
import test from "node:test";
import { estimatedMonthlySaving, reviewScore } from "./subscription-insights.ts";

const base = {
  id: "subscription",
  name: "契約",
  price: 1000,
  billingCycle: "MONTHLY",
  nextBillingDate: new Date("2026-09-15T00:00:00.000Z"),
  lastReviewedAt: new Date(),
  usageFrequency: "WEEKLY",
  priority: "STANDARD",
};

test("過去のトライアルと解約期限を直近期限として加点しない", () => {
  const result = reviewScore({
    ...base,
    trialEndsAt: new Date("2020-01-01T00:00:00.000Z"),
    cancellationDeadline: new Date("2020-01-01T00:00:00.000Z"),
  });

  assert.equal(result.reasons.includes("無料トライアル終了が近い"), false);
  assert.equal(result.reasons.includes("解約期限が近い"), false);
});

test("削減見込みは利用頻度と重要度に応じて最大50パーセントに補正する", () => {
  assert.equal(estimatedMonthlySaving({ ...base, usageFrequency: "RARELY" }), 250);
  assert.equal(estimatedMonthlySaving({ ...base, usageFrequency: "RARELY", priority: "OPTIONAL" }), 500);
  assert.equal(estimatedMonthlySaving(base), 0);
});
