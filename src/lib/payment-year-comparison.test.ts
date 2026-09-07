import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPaymentYearComparison,
  resolvePaymentTrendYear,
  type PaymentTrendItem,
} from "./payment-year-comparison.ts";

const now = new Date("2026-08-29T03:00:00.000Z");
const payment = (name: string, amount: number, paidAt: string, category = "仕事"): PaymentTrendItem => ({
  amount,
  paidAt: new Date(paidAt),
  subscriptionNameSnapshot: name,
  categoryNameSnapshot: category,
});

test("対象年は日本時間の現在年までに制限する", () => {
  assert.equal(resolvePaymentTrendYear(undefined, now), 2026);
  assert.equal(resolvePaymentTrendYear("2025", now), 2025);
  assert.equal(resolvePaymentTrendYear("2027", now), 2026);
  assert.equal(resolvePaymentTrendYear("invalid", now), 2026);
});

test("今年は現在月までを前年同期間と比較して年間着地を見積もる", () => {
  const result = buildPaymentYearComparison([
    payment("A", 1_000, "2026-01-10T00:00:00.000Z"),
    payment("A", 2_000, "2026-08-10T00:00:00.000Z"),
    payment("A", 900, "2025-01-10T00:00:00.000Z"),
    payment("A", 1_100, "2025-08-10T00:00:00.000Z"),
    payment("A", 9_999, "2025-12-10T00:00:00.000Z"),
  ], 2026, now);
  assert.equal(result.comparableMonthCount, 8);
  assert.equal(result.currentAmount, 3_000);
  assert.equal(result.previousAmount, 2_000);
  assert.equal(result.difference, 1_000);
  assert.equal(result.changePercent, 50);
  assert.equal(result.annualProjection, 4_500);
});

test("日本時間の年境界で支払い月を分類する", () => {
  const result = buildPaymentYearComparison([
    payment("A", 500, "2025-12-31T15:00:00.000Z"),
  ], 2026, now);
  assert.equal(result.months[0].currentAmount, 500);
  assert.equal(result.months[11].previousAmount, 0);
});

test("新規・増額・終了・減額をサービス別の増減要因に分ける", () => {
  const result = buildPaymentYearComparison([
    payment("新規", 3_000, "2026-02-01T00:00:00.000Z"),
    payment("増額", 2_000, "2026-02-01T00:00:00.000Z"),
    payment("増額", 1_000, "2025-02-01T00:00:00.000Z"),
    payment("終了", 2_500, "2025-02-01T00:00:00.000Z"),
    payment("減額", 500, "2026-02-01T00:00:00.000Z"),
    payment("減額", 1_500, "2025-02-01T00:00:00.000Z"),
  ], 2026, now);
  assert.deepEqual(result.increases.map((item) => [item.name, item.kind]), [["新規", "NEW"], ["増額", "INCREASE"]]);
  assert.deepEqual(result.decreases.map((item) => [item.name, item.kind]), [["終了", "ENDED"], ["減額", "DECREASE"]]);
});

test("前年実績がない場合は増減率を推測しない", () => {
  const result = buildPaymentYearComparison([
    payment("A", 1_000, "2026-01-10T00:00:00.000Z"),
  ], 2026, now);
  assert.equal(result.changePercent, null);
});
