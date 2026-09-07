import assert from "node:assert/strict";
import test from "node:test";
import { MONTHLY_PAYMENT_EXPORT_HEADERS, PAYMENT_EXPORT_HEADERS, monthlyPaymentExportRow, paymentExportRow } from "./payment-export.ts";

test("支払記録時の仕事利用割合で仕事分と個人分を分ける", () => {
  const row = paymentExportRow({
    amount: 12_000,
    paidAt: new Date("2026-08-20T00:00:00.000Z"),
    businessUsePercent: 65,
    subscriptionNameSnapshot: "制作サービス",
    categoryNameSnapshot: "仕事・業務",
    paymentMethodNameSnapshot: "Visa",
    accountingLabel: "通信費",
    referenceNumber: "INV-2026-08",
    referenceUrl: "https://billing.example.test/invoices/2026-08",
    memo: "年払い",
  });

  assert.deepEqual(row, [
    "2026-08-20",
    "制作サービス",
    "12000",
    "65",
    "7800",
    "4200",
    "仕事・業務",
    "Visa",
    "通信費",
    "INV-2026-08",
    "https://billing.example.test/invoices/2026-08",
    "年払い",
  ]);
  assert.equal(row.length, PAYMENT_EXPORT_HEADERS.length);
});

test("未設定の分類とメモは空欄で出力する", () => {
  const row = paymentExportRow({
    amount: 480,
    paidAt: new Date("2026-01-01T00:00:00.000Z"),
    businessUsePercent: 0,
    subscriptionNameSnapshot: "個人サービス",
    categoryNameSnapshot: null,
    paymentMethodNameSnapshot: null,
    accountingLabel: null,
    referenceNumber: null,
    referenceUrl: null,
    memo: null,
  });

  assert.deepEqual(row.slice(3), ["0", "0", "480", "", "", "", "", "", ""]);
});

test("月次CSVだけに整理状態と不足項目を追加する", () => {
  const record = {
    amount: 980,
    paidAt: new Date("2026-08-10T00:00:00.000Z"),
    businessUsePercent: 50,
    subscriptionNameSnapshot: "業務サービス",
    categoryNameSnapshot: "仕事・業務",
    paymentMethodNameSnapshot: "Visa",
    accountingLabel: "通信費",
    referenceNumber: null,
    referenceUrl: null,
    memo: null,
  };
  const row = monthlyPaymentExportRow(record);
  assert.deepEqual(row.slice(-2), ["要整理", "証憑"]);
  assert.equal(row.length, MONTHLY_PAYMENT_EXPORT_HEADERS.length);
  assert.equal(paymentExportRow(record).length, PAYMENT_EXPORT_HEADERS.length);
});
