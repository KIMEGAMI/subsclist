import assert from "node:assert/strict";
import test from "node:test";
import { matchesPaymentHistoryFilter, paymentHistoryFilterLabel, resolvePaymentHistoryFilter } from "./payment-history-filter.ts";

const referenceDate = new Date("2026-08-30T03:00:00.000Z");

test("未指定では日本時間の当月を対象にする", () => {
  const filter = resolvePaymentHistoryFilter({}, referenceDate);
  assert.equal(filter.year, null);
  assert.equal(filter.periodLabel, "2026年8月");
  assert.equal(filter.start.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(filter.end.toISOString(), "2026-09-01T00:00:00.000Z");
});

test("対象年は現在年までに制限し不正値を当月へ戻す", () => {
  assert.equal(resolvePaymentHistoryFilter({ year: "2025" }, referenceDate).year, 2025);
  assert.equal(resolvePaymentHistoryFilter({ year: "2027" }, referenceDate).year, null);
  assert.equal(resolvePaymentHistoryFilter({ year: "20x6" }, referenceDate).year, null);
  assert.equal(resolvePaymentHistoryFilter({ year: "1999" }, referenceDate).year, null);
});

test("整理済みと未整理を科目・証憑の両方で判定する", () => {
  const organized = { accountingLabel: "通信費", referenceNumber: "INV-1", referenceUrl: null };
  const missingAccounting = { accountingLabel: null, referenceNumber: "INV-2", referenceUrl: null };
  const missingEvidence = { accountingLabel: "通信費", referenceNumber: null, referenceUrl: null };
  assert.equal(matchesPaymentHistoryFilter(organized, "ORGANIZED", "ANY"), true);
  assert.equal(matchesPaymentHistoryFilter(missingAccounting, "MISSING", "ACCOUNTING"), true);
  assert.equal(matchesPaymentHistoryFilter(missingAccounting, "MISSING", "EVIDENCE"), false);
  assert.equal(matchesPaymentHistoryFilter(missingEvidence, "MISSING", "EVIDENCE"), true);
  assert.equal(matchesPaymentHistoryFilter(organized, "MISSING", "ANY"), false);
});

test("フィルター状態を日本語で表示する", () => {
  assert.equal(paymentHistoryFilterLabel("ALL", "ANY"), "すべて");
  assert.equal(paymentHistoryFilterLabel("MISSING", "ANY"), "未整理");
  assert.equal(paymentHistoryFilterLabel("MISSING", "ACCOUNTING"), "科目不足");
  assert.equal(paymentHistoryFilterLabel("MISSING", "EVIDENCE"), "証憑不足");
  assert.equal(paymentHistoryFilterLabel("ORGANIZED", "ANY"), "整理済み");
});
