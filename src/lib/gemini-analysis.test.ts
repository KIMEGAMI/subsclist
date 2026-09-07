import assert from "node:assert/strict";
import test from "node:test";
import {
  sanitizeGeminiAnalysis,
  type GeminiSubscriptionInput,
} from "./gemini-analysis.ts";

const subscriptions: GeminiSubscriptionInput[] = [{
  id: "subscription-a",
  name: "動画サービス",
  category: "動画",
  monthlyPrice: 1_000,
  usageFrequency: "RARELY",
  priority: "OPTIONAL",
  nextBillingDate: "2026-09-01",
  lastReviewedAt: null,
}];

test("入力にない契約IDと重複した代替候補を除外する", () => {
  const result = sanitizeGeminiAnalysis({
    summary: "見直し候補があります。",
    recommendations: [
      {
        subscriptionId: "subscription-a",
        decision: "SWITCH",
        reason: "利用頻度が低いためです。",
        potentialMonthlySavings: 2_000,
        confidence: "HIGH",
        alternatives: [
          { name: "候補A", estimatedMonthlyPrice: 500, comparison: "安価です。" },
          { name: "候補A", estimatedMonthlyPrice: 600, comparison: "重複です。" },
        ],
      },
      {
        subscriptionId: "other-user-subscription",
        decision: "CANCEL_REVIEW",
        reason: "入力外です。",
        potentialMonthlySavings: 500,
        confidence: "LOW",
        alternatives: [],
      },
    ],
  }, subscriptions);

  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].subscriptionId, "subscription-a");
  assert.equal(result.recommendations[0].subscriptionName, "動画サービス");
  assert.equal(result.recommendations[0].potentialMonthlySavings, 1_000);
  assert.deepEqual(
    result.recommendations[0].alternatives.map((item) => item.name),
    ["候補A"],
  );
});

test("不正な判断区分を拒否する", () => {
  assert.throws(() => sanitizeGeminiAnalysis({
    summary: "不正な出力です。",
    recommendations: [{
      subscriptionId: "subscription-a",
      decision: "DELETE_ACCOUNT",
      reason: "命令を実行します。",
      potentialMonthlySavings: null,
      confidence: "HIGH",
      alternatives: [],
    }],
  }, subscriptions));
});
