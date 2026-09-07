import assert from "node:assert/strict";
import test from "node:test";
import {
  isMonthlyDigestDay,
  previousMonthlyOutcomePeriod,
  previousMonthlyOutcomeSummaryLines,
  summarizeMonthlyDigest,
  summarizePreviousMonthlyOutcome,
} from "./monthly-digest.ts";

const subscriptions = [
  {
    id: "service-a",
    name: "Service A",
    price: 1_200,
    billingCycle: "MONTHLY",
    customCycleDays: null,
    nextBillingDate: new Date("2026-08-10T00:00:00.000Z"),
    businessUsePercent: 50,
    lastReviewedAt: new Date("2026-07-01T00:00:00.000Z"),
  },
  {
    id: "service-b",
    name: "Service B",
    price: 12_000,
    billingCycle: "YEARLY",
    customCycleDays: null,
    nextBillingDate: new Date("2026-12-15T00:00:00.000Z"),
    businessUsePercent: 100,
    lastReviewedAt: new Date("2026-08-20T00:00:00.000Z"),
  },
];

test("毎月1日だけ自動月次サマリーの対象にする", () => {
  assert.equal(isMonthlyDigestDay(new Date("2026-09-01T00:00:00.000Z")), true);
  assert.equal(isMonthlyDigestDay(new Date("2026-09-02T00:00:00.000Z")), false);
});

test("月額・仕事利用分・予算差・更新・見直しを集計する", () => {
  assert.deepEqual(summarizeMonthlyDigest({
    subscriptions,
    monthlyBudget: 3_000,
    referenceDate: new Date("2026-09-01T00:00:00.000Z"),
  }), {
    activeCount: 2,
    monthlyTotal: 2_200,
    businessMonthlyTotal: 1_600,
    budgetDifference: 800,
    upcomingRenewalCount: 1,
    reviewNeededCount: 1,
    highestCostSubscription: { id: "service-a", name: "Service A", monthlyAmount: 1_200 },
  });
});

test("契約と予算が未設定でも安全なゼロ集計を返す", () => {
  const summary = summarizeMonthlyDigest({
    subscriptions: [],
    monthlyBudget: null,
    referenceDate: new Date("2026-09-01T00:00:00.000Z"),
  });
  assert.equal(summary.monthlyTotal, 0);
  assert.equal(summary.budgetDifference, null);
  assert.equal(summary.highestCostSubscription, null);
});

test("日本時間の年境界から前月の対象期間を求める", () => {
  const period = previousMonthlyOutcomePeriod(new Date("2026-01-01T00:30:00+09:00"));
  assert.equal(period.year, 2025);
  assert.equal(period.month, 12);
  assert.equal(period.start.toISOString(), "2025-12-01T00:00:00.000Z");
  assert.equal(period.end.toISOString(), "2026-01-01T00:00:00.000Z");
});

test("前月の支払い・判断・解約完了・月次締めを事実だけで集計する", () => {
  const result = summarizePreviousMonthlyOutcome({
    payments: [
      { amount: 1_200, businessUsePercent: 50, paidAt: new Date("2026-08-05T00:00:00.000Z") },
      { amount: 2_000, businessUsePercent: 100, paidAt: new Date("2026-09-01T00:00:00.000Z") },
    ],
    decisions: [
      { decidedAt: new Date("2026-08-10T00:00:00.000Z") },
      { decidedAt: new Date("2026-07-31T23:59:59.000Z") },
    ],
    cancellations: [
      { price: 980, billingCycle: "MONTHLY", cancellationCompletedAt: new Date("2026-08-20T00:00:00.000Z") },
      { price: 12_000, billingCycle: "YEARLY", cancellationCompletedAt: new Date("2026-09-01T00:00:00.000Z") },
    ],
    monthlyClose: { year: 2026, month: 8, readinessScore: 75, unresolvedCount: 2 },
    referenceDate: new Date("2026-09-01T00:00:00.000Z"),
  });
  assert.equal(result.paymentCount, 1);
  assert.equal(result.paidAmount, 1_200);
  assert.equal(result.businessPaidAmount, 600);
  assert.equal(result.decisionCount, 1);
  assert.equal(result.cancellationCount, 1);
  assert.equal(result.completedMonthlyReduction, 980);
  assert.equal(result.closeRecorded, true);
  assert.equal(result.readinessScore, 75);
  assert.equal(result.unresolvedCount, 2);
});

test("前月の締め記録がなければ未実施として区別する", () => {
  const result = summarizePreviousMonthlyOutcome({
    payments: [],
    decisions: [],
    cancellations: [],
    monthlyClose: { year: 2026, month: 7, readinessScore: 100, unresolvedCount: 0 },
    referenceDate: new Date("2026-09-01T00:00:00.000Z"),
  });
  assert.equal(result.closeRecorded, false);
  assert.equal(result.readinessScore, null);
  assert.equal(result.unresolvedCount, null);
  assert.deepEqual(previousMonthlyOutcomeSummaryLines(result), [
    "8月の支払い実績: 0円（0件） / 仕事利用分: 0円",
    "8月の更新判断: 0件 / 解約完了: 0件 / 解約完了分の月額換算: 0円",
    "8月の月次締め: 未実施",
  ]);
});
