import assert from "node:assert/strict";
import test from "node:test";
import {
  PAYMENT_HISTORY_BULK_MAX_ITEMS,
  paymentHistoryBulkOrganizationSchema,
} from "./payment-history-bulk-organization.ts";

test("一括整理は重複しない支払い履歴を1件以上受け付ける", () => {
  assert.equal(paymentHistoryBulkOrganizationSchema.safeParse({
    paymentHistoryIds: ["history-1", "history-2"],
    accountingLabel: "通信費",
  }).success, true);
  assert.equal(paymentHistoryBulkOrganizationSchema.safeParse({
    paymentHistoryIds: [],
    accountingLabel: "通信費",
  }).success, false);
  assert.equal(paymentHistoryBulkOrganizationSchema.safeParse({
    paymentHistoryIds: ["history-1", "history-1"],
    accountingLabel: "通信費",
  }).success, false);
});

test("科目の空文字と上限を超える件数を拒否する", () => {
  assert.equal(paymentHistoryBulkOrganizationSchema.safeParse({
    paymentHistoryIds: ["history-1"],
    accountingLabel: "   ",
  }).success, false);
  assert.equal(paymentHistoryBulkOrganizationSchema.safeParse({
    paymentHistoryIds: Array.from({ length: PAYMENT_HISTORY_BULK_MAX_ITEMS + 1 }, (_, index) => `history-${index}`),
    accountingLabel: "通信費",
  }).success, false);
});

test("科目の前後空白を除去する", () => {
  const parsed = paymentHistoryBulkOrganizationSchema.parse({
    paymentHistoryIds: ["history-1"],
    accountingLabel: "  ソフトウェア利用料  ",
  });
  assert.equal(parsed.accountingLabel, "ソフトウェア利用料");
});
