import assert from "node:assert/strict";
import test from "node:test";
import { monthlyClosePeriod, summarizeMonthlyClose } from "./monthly-close.ts";

test("日本時間の月境界から締め対象月を決める", () => {
  assert.deepEqual(
    monthlyClosePeriod(new Date("2026-08-31T15:30:00.000Z")),
    {
      year: 2026,
      month: 9,
      start: new Date("2026-09-01T00:00:00.000Z"),
      end: new Date("2026-10-01T00:00:00.000Z"),
      today: new Date("2026-09-01T00:00:00.000Z"),
    },
  );
});

test("支払い実績と仕事利用分を支払時点の割合で集計する", () => {
  const summary = summarizeMonthlyClose({
    now: new Date("2026-08-20T03:00:00.000Z"),
    subscriptions: [
      {
        price: 1_200,
        billingCycle: "MONTHLY",
        customCycleDays: null,
        lastReviewedAt: new Date("2026-08-10T10:00:00.000Z"),
        trialEndsAt: new Date("2026-08-25T00:00:00.000Z"),
        cancellationDeadline: null,
      },
      {
        price: 12_000,
        billingCycle: "YEARLY",
        customCycleDays: null,
        lastReviewedAt: new Date("2026-07-31T10:00:00.000Z"),
        trialEndsAt: null,
        cancellationDeadline: new Date("2026-09-01T00:00:00.000Z"),
      },
    ],
    payments: [
      {
        amount: 1_200,
        businessUsePercent: 75,
        paidAt: new Date("2026-08-05T00:00:00.000Z"),
      },
      {
        amount: 500,
        businessUsePercent: 100,
        paidAt: new Date("2026-07-31T00:00:00.000Z"),
      },
    ],
  });

  assert.equal(summary.paidAmount, 1_200);
  assert.equal(summary.businessPaidAmount, 900);
  assert.equal(summary.activeMonthlyAmount, 2_200);
  assert.equal(summary.activeSubscriptionCount, 2);
  assert.equal(summary.reviewedSubscriptionCount, 1);
  assert.equal(summary.deadlineRiskCount, 1);
});

test("同じ契約の複数期限はリスク1件として数える", () => {
  const summary = summarizeMonthlyClose({
    now: new Date("2026-08-01T03:00:00.000Z"),
    subscriptions: [
      {
        price: 980,
        billingCycle: "MONTHLY",
        customCycleDays: null,
        lastReviewedAt: null,
        trialEndsAt: new Date("2026-08-10T00:00:00.000Z"),
        cancellationDeadline: new Date("2026-08-15T00:00:00.000Z"),
      },
    ],
    payments: [],
  });

  assert.equal(summary.deadlineRiskCount, 1);
});
