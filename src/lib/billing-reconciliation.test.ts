import assert from "node:assert/strict";
import test from "node:test";
import { reconcileBillingPeriod } from "./billing-reconciliation.ts";

const rangeStart = new Date("2026-08-01T00:00:00.000Z");
const rangeEnd = new Date("2026-09-01T00:00:00.000Z");
const now = new Date("2026-08-20T00:00:00.000Z");

test("週次請求を月内の全予定として支払い履歴と一対一で突合する", () => {
  const result = reconcileBillingPeriod({
    subscriptions: [{
      id: "weekly",
      name: "Weekly service",
      price: 500,
      billingCycle: "WEEKLY",
      customCycleDays: null,
      nextBillingDate: new Date("2026-08-01T00:00:00.000Z"),
    }],
    payments: [
      { id: "p1", subscriptionId: "weekly", amount: 500, paidAt: new Date("2026-08-01T00:00:00.000Z") },
      { id: "p2", subscriptionId: "weekly", amount: 650, paidAt: new Date("2026-08-09T00:00:00.000Z") },
    ],
    rangeStart,
    rangeEnd,
    now,
  });

  assert.equal(result.items.length, 5);
  assert.deepEqual(
    result.items.map((item) => item.status),
    ["PAID_AS_EXPECTED", "AMOUNT_MISMATCH", "UNCONFIRMED", "UPCOMING", "UPCOMING"],
  );
  assert.equal(result.items[1].difference, 150);
  assert.deepEqual(result.summary, {
    expectedCount: 5,
    expectedAmount: 2500,
    recordedAmount: 1150,
    amountDifference: -1350,
    paidAsExpectedCount: 1,
    amountMismatchCount: 1,
    unconfirmedCount: 1,
    upcomingCount: 2,
    unmatchedPaymentCount: 0,
  });
});

test("支払日は予定日の前後7日まで許容し最も近い履歴を使う", () => {
  const result = reconcileBillingPeriod({
    subscriptions: [{
      id: "monthly",
      name: "Monthly service",
      price: 1000,
      billingCycle: "MONTHLY",
      customCycleDays: null,
      nextBillingDate: new Date("2026-08-15T00:00:00.000Z"),
    }],
    payments: [
      { id: "far", subscriptionId: "monthly", amount: 1000, paidAt: new Date("2026-08-08T00:00:00.000Z") },
      { id: "near", subscriptionId: "monthly", amount: 1000, paidAt: new Date("2026-08-14T00:00:00.000Z") },
    ],
    rangeStart,
    rangeEnd,
    now,
  });

  assert.equal(result.items[0].paymentId, "near");
  assert.equal(result.summary.unmatchedPaymentCount, 1);
  assert.deepEqual(result.unmatchedPayments.map((payment) => payment.id), ["far"]);
});

test("支払いがない当日以前は未確認、未来日は今後と判定する", () => {
  const result = reconcileBillingPeriod({
    subscriptions: [
      {
        id: "today",
        name: "Due today",
        price: 800,
        billingCycle: "MONTHLY",
        customCycleDays: null,
        nextBillingDate: new Date("2026-08-20T00:00:00.000Z"),
      },
      {
        id: "future",
        name: "Future",
        price: 1200,
        billingCycle: "MONTHLY",
        customCycleDays: null,
        nextBillingDate: new Date("2026-08-25T00:00:00.000Z"),
      },
    ],
    payments: [],
    rangeStart,
    rangeEnd,
    now,
  });

  assert.deepEqual(
    result.items.map((item) => item.status),
    ["UNCONFIRMED", "UPCOMING"],
  );
});

test("別サブスクの支払いと8日以上離れた支払いは突合しない", () => {
  const result = reconcileBillingPeriod({
    subscriptions: [{
      id: "target",
      name: "Target",
      price: 1000,
      billingCycle: "MONTHLY",
      customCycleDays: null,
      nextBillingDate: new Date("2026-08-10T00:00:00.000Z"),
    }],
    payments: [
      { id: "other", subscriptionId: "other", amount: 1000, paidAt: new Date("2026-08-10T00:00:00.000Z") },
      { id: "late", subscriptionId: "target", amount: 1000, paidAt: new Date("2026-08-18T00:00:00.000Z") },
    ],
    rangeStart,
    rangeEnd,
    now,
  });

  assert.equal(result.items[0].status, "UNCONFIRMED");
  assert.equal(result.items[0].paymentId, null);
  assert.equal(result.summary.unmatchedPaymentCount, 2);
  assert.deepEqual(result.unmatchedPayments.map((payment) => payment.id), ["other", "late"]);
});
