import assert from "node:assert/strict";
import test from "node:test";
import { paymentHistoryDetailsData, paymentHistoryDetailsSchema, paymentHistoryDuplicateFilter, paymentHistoryMutationSchema } from "./payment-history-input.ts";

const validInput = {
  amount: 480,
  paidAt: "2026-08-28",
  accountingLabel: " 通信費 ",
  referenceNumber: " INV-001 ",
  referenceUrl: "https://billing.example.test/receipt",
  memo: " 確認済み ",
};

test("支払履歴の修正値を正規化する", () => {
  const parsed = paymentHistoryDetailsSchema.parse(validInput);
  assert.deepEqual(paymentHistoryDetailsData(parsed), {
    amount: 480,
    paidAt: new Date("2026-08-28T00:00:00.000Z"),
    accountingLabel: "通信費",
    referenceNumber: "INV-001",
    referenceUrl: "https://billing.example.test/receipt",
    memo: "確認済み",
  });
});

test("不正な日付とHTTP以外の証憑URLを拒否する", () => {
  assert.equal(paymentHistoryDetailsSchema.safeParse({ ...validInput, paidAt: "2026-02-30" }).success, false);
  assert.equal(paymentHistoryDetailsSchema.safeParse({ ...validInput, referenceUrl: "javascript:alert(1)" }).success, false);
});

test("任意項目の空文字をnullへ正規化する", () => {
  const parsed = paymentHistoryDetailsSchema.parse({
    amount: "0",
    paidAt: "2026-01-01",
    accountingLabel: "",
    referenceNumber: "",
    referenceUrl: "",
    memo: "",
  });
  assert.deepEqual(paymentHistoryDetailsData(parsed), {
    amount: 0,
    paidAt: new Date("2026-01-01T00:00:00.000Z"),
    accountingLabel: null,
    referenceNumber: null,
    referenceUrl: null,
    memo: null,
  });
});

test("重複許可は明示的なtrueだけを受け付ける", () => {
  assert.equal(paymentHistoryMutationSchema.safeParse({ ...validInput, allowDuplicate: true }).success, true);
  assert.equal(paymentHistoryMutationSchema.safeParse({ ...validInput, allowDuplicate: false }).success, false);
  assert.equal(paymentHistoryMutationSchema.safeParse({ ...validInput, allowDuplicate: "true" }).success, false);
});

test("同じ所有者・契約・金額・支払日を重複条件にする", () => {
  const parsed = paymentHistoryDetailsSchema.parse(validInput);
  assert.deepEqual(paymentHistoryDuplicateFilter("user-1", "sub-1", parsed), {
    userId: "user-1",
    subscriptionId: "sub-1",
    amount: 480,
    paidAt: new Date("2026-08-28T00:00:00.000Z"),
  });
  assert.deepEqual(paymentHistoryDuplicateFilter("user-1", "sub-1", parsed, "history-1").id, { not: "history-1" });
});
