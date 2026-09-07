import assert from "node:assert/strict";
import test from "node:test";
import { buildAnnualBusinessReport } from "./annual-business-report.ts";

test("支払い時点の仕事利用割合から年間の仕事分と個人分を分ける", () => {
  const report = buildAnnualBusinessReport([
    {
      amount: 10_000,
      paidAt: new Date("2026-02-01T03:00:00.000Z"),
      businessUsePercent: 60,
      categoryNameSnapshot: "制作",
      accountingLabel: "通信費",
      referenceNumber: "INV-1",
      referenceUrl: null,
    },
    {
      amount: 2_000,
      paidAt: new Date("2026-02-15T03:00:00.000Z"),
      businessUsePercent: 0,
      categoryNameSnapshot: "娯楽",
      accountingLabel: null,
      referenceNumber: null,
      referenceUrl: null,
    },
  ], 2026);

  assert.equal(report.totalPaid, 12_000);
  assert.equal(report.businessPaid, 6_000);
  assert.equal(report.personalPaid, 6_000);
  assert.equal(report.months[1]?.paymentCount, 2);
});

test("日本時間の年境界で対象年を判定する", () => {
  const report = buildAnnualBusinessReport([{
    amount: 1_000,
    paidAt: new Date("2025-12-31T15:30:00.000Z"),
    businessUsePercent: 100,
    categoryNameSnapshot: null,
    accountingLabel: "通信費",
    referenceNumber: "1",
    referenceUrl: null,
  }], 2026);

  assert.equal(report.paymentCount, 1);
  assert.equal(report.months[0]?.paidAmount, 1_000);
});

test("カテゴリ別の仕事利用分と未整理件数を支払時点の値で集計する", () => {
  const report = buildAnnualBusinessReport([
    {
      amount: 8_000,
      paidAt: new Date("2026-01-01T03:00:00.000Z"),
      businessUsePercent: 50,
      categoryNameSnapshot: "AI",
      accountingLabel: "通信費",
      referenceNumber: null,
      referenceUrl: "https://example.test/receipt",
    },
    {
      amount: 2_000,
      paidAt: new Date("2026-03-01T03:00:00.000Z"),
      businessUsePercent: 100,
      categoryNameSnapshot: "AI",
      accountingLabel: null,
      referenceNumber: null,
      referenceUrl: null,
    },
  ], 2026);

  assert.deepEqual(report.categories[0], {
    name: "AI",
    paymentCount: 2,
    paidAmount: 10_000,
    businessAmount: 6_000,
    missingCount: 1,
    sharePercent: 100,
  });
  assert.equal(report.organization.completionPercent, 50);
});

test("支払いがない年は割合を推測せず安全なゼロ集計にする", () => {
  const report = buildAnnualBusinessReport([], 2026);
  assert.equal(report.totalPaid, 0);
  assert.equal(report.organization.completionPercent, 0);
  assert.equal(report.categories.length, 0);
  assert.equal(report.months.length, 12);
});
