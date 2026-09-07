import assert from "node:assert/strict";
import test from "node:test";
import { buildActionInbox } from "./action-inbox.ts";

const now = new Date("2026-08-28T03:00:00.000Z");

function subscription(overrides: Partial<Parameters<typeof buildActionInbox>[0]["subscriptions"][number]> = {}) {
  return {
    id: "sub-1",
    name: "制作サービス",
    nextBillingDate: new Date("2026-08-28T00:00:00.000Z"),
    trialEndsAt: null,
    cancellationDeadline: null,
    paymentRecordedForCycle: false,
    renewalDecisionRecorded: false,
    weeklyReviewNeeded: true,
    ...overrides,
  };
}

test("同じ契約では最優先の期限タスクだけを表示する", () => {
  const tasks = buildActionInbox({
    subscriptions: [subscription({
      trialEndsAt: new Date("2026-08-29T00:00:00.000Z"),
      cancellationDeadline: new Date("2026-08-28T00:00:00.000Z"),
    })],
    payments: [],
    monthlyCloseCompleted: true,
    budgetExceeded: false,
    premium: true,
    now,
  });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].type, "CANCELLATION_DEADLINE");
  assert.equal(tasks[0].priority, "URGENT");
});

test("更新判断が必要な契約では週次確認を重複表示しない", () => {
  const tasks = buildActionInbox({
    subscriptions: [subscription({ nextBillingDate: new Date("2026-09-05T00:00:00.000Z") })],
    payments: [],
    monthlyCloseCompleted: true,
    budgetExceeded: false,
    premium: true,
    now,
  });
  assert.deepEqual(tasks.map((item) => item.type), ["RENEWAL_DECISION"]);
});

test("更新日当日は未記録の支払い確認を最優先にする", () => {
  const tasks = buildActionInbox({
    subscriptions: [subscription()],
    payments: [],
    monthlyCloseCompleted: true,
    budgetExceeded: false,
    premium: true,
    now,
  });
  assert.deepEqual(tasks.map((item) => item.type), ["PAYMENT_DUE"]);
});

test("FreeではPremium限定タスクを作らず週次確認を案内する", () => {
  const tasks = buildActionInbox({
    subscriptions: [subscription({ nextBillingDate: new Date("2026-09-05T00:00:00.000Z") })],
    payments: [],
    monthlyCloseCompleted: false,
    budgetExceeded: false,
    premium: false,
    now,
  });
  assert.deepEqual(tasks.map((item) => item.type), ["WEEKLY_REVIEW"]);
});

test("科目または証憑が不足する支払いを整理タスクにする", () => {
  const tasks = buildActionInbox({
    subscriptions: [],
    payments: [{
      id: "payment-1",
      subscriptionId: "sub-1",
      subscriptionName: "制作サービス",
      paidAt: new Date("2026-08-20T00:00:00.000Z"),
      accountingLabel: "通信費",
      referenceNumber: null,
      referenceUrl: null,
    }],
    monthlyCloseCompleted: true,
    budgetExceeded: false,
    premium: true,
    now,
  });
  assert.equal(tasks[0].type, "PAYMENT_ORGANIZATION");
  assert.match(tasks[0].detail, /証憑/);
});

test("月末は予算超過と未完了の月次締めを表示する", () => {
  const tasks = buildActionInbox({
    subscriptions: [],
    payments: [],
    monthlyCloseCompleted: false,
    budgetExceeded: true,
    premium: true,
    now,
  });
  assert.deepEqual(tasks.map((item) => item.type), ["BUDGET", "MONTHLY_CLOSE"]);
});

test("対応済みで期限外ならタスクを表示しない", () => {
  const tasks = buildActionInbox({
    subscriptions: [subscription({
      nextBillingDate: new Date("2026-10-28T00:00:00.000Z"),
      paymentRecordedForCycle: true,
      renewalDecisionRecorded: true,
      weeklyReviewNeeded: false,
    })],
    payments: [{
      id: "payment-1",
      subscriptionId: "sub-1",
      subscriptionName: "制作サービス",
      paidAt: new Date("2026-08-20T00:00:00.000Z"),
      accountingLabel: "通信費",
      referenceNumber: "INV-001",
      referenceUrl: null,
    }],
    monthlyCloseCompleted: true,
    budgetExceeded: false,
    premium: true,
    now,
  });
  assert.deepEqual(tasks, []);
});

test("Premiumでは金額差異・期限超過・予定外支払いを優先表示する", () => {
  const tasks = buildActionInbox({
    subscriptions: [],
    payments: [],
    monthlyCloseCompleted: true,
    budgetExceeded: false,
    premium: true,
    reconciliation: {
      items: [
        {
          id: "sub-1:2026-08-27",
          subscriptionId: "sub-1",
          subscriptionName: "制作サービス",
          occurrenceAt: new Date("2026-08-27T00:00:00.000Z"),
          expectedAmount: 1000,
          paymentId: null,
          paidAt: null,
          paidAmount: null,
          difference: null,
          status: "UNCONFIRMED",
        },
        {
          id: "sub-2:2026-08-20",
          subscriptionId: "sub-2",
          subscriptionName: "クラウドサービス",
          occurrenceAt: new Date("2026-08-20T00:00:00.000Z"),
          expectedAmount: 2000,
          paymentId: "payment-2",
          paidAt: new Date("2026-08-20T00:00:00.000Z"),
          paidAmount: 2500,
          difference: 500,
          status: "AMOUNT_MISMATCH",
        },
      ],
      unmatchedPayments: [{
        id: "payment-3",
        subscriptionId: "sub-3",
        subscriptionName: "ストレージサービス",
        amount: 800,
        paidAt: new Date("2026-08-18T00:00:00.000Z"),
      }],
    },
    now,
  });

  assert.deepEqual(tasks.map((item) => item.type), [
    "PAYMENT_AMOUNT_MISMATCH",
    "PAYMENT_UNCONFIRMED",
    "PAYMENT_UNMATCHED",
  ]);
  assert.match(tasks[0].detail, /差額 \+500円/);
  assert.match(tasks[1].detail, /1日過ぎています/);
  assert.match(tasks[2].detail, /請求予定と結び付いていません/);
});

test("詳細な請求突合はFreeの要対応へ表示しない", () => {
  const tasks = buildActionInbox({
    subscriptions: [],
    payments: [],
    monthlyCloseCompleted: true,
    budgetExceeded: false,
    premium: false,
    reconciliation: {
      items: [{
        id: "sub-1:2026-08-27",
        subscriptionId: "sub-1",
        subscriptionName: "制作サービス",
        occurrenceAt: new Date("2026-08-27T00:00:00.000Z"),
        expectedAmount: 1000,
        paymentId: null,
        paidAt: null,
        paidAmount: null,
        difference: null,
        status: "UNCONFIRMED",
      }],
      unmatchedPayments: [],
    },
    now,
  });

  assert.deepEqual(tasks, []);
});

test("詳細突合がある場合は当日支払いタスクを重複させない", () => {
  const tasks = buildActionInbox({
    subscriptions: [subscription({
      renewalDecisionRecorded: true,
      weeklyReviewNeeded: false,
    })],
    payments: [],
    monthlyCloseCompleted: true,
    budgetExceeded: false,
    premium: true,
    reconciliation: {
      items: [{
        id: "sub-1:2026-08-28",
        subscriptionId: "sub-1",
        subscriptionName: "制作サービス",
        occurrenceAt: new Date("2026-08-28T00:00:00.000Z"),
        expectedAmount: 1000,
        paymentId: null,
        paidAt: null,
        paidAmount: null,
        difference: null,
        status: "UNCONFIRMED",
      }],
      unmatchedPayments: [],
    },
    now,
  });

  assert.deepEqual(tasks.map((item) => item.type), ["PAYMENT_UNCONFIRMED"]);
});
