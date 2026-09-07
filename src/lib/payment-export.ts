import { isoDate } from "./billing.ts";
import { paymentOrganizationMissing } from "./payment-organization.ts";
import { businessUseAmount } from "./subscription-business.ts";

export type PaymentExportRecord = {
  amount: number;
  paidAt: Date;
  businessUsePercent: number;
  subscriptionNameSnapshot: string;
  categoryNameSnapshot: string | null;
  paymentMethodNameSnapshot: string | null;
  accountingLabel: string | null;
  referenceNumber: string | null;
  referenceUrl: string | null;
  memo: string | null;
};

export const PAYMENT_EXPORT_HEADERS = [
  "支払日",
  "サービス名（支払記録時）",
  "支払額",
  "仕事利用割合（支払記録時）",
  "仕事利用分（見積）",
  "個人利用分（見積）",
  "カテゴリ（支払記録時）",
  "支払い方法（支払記録時）",
  "整理用科目",
  "領収書・請求書番号",
  "証憑URL",
  "メモ",
] as const;

export const MONTHLY_PAYMENT_EXPORT_HEADERS = [
  ...PAYMENT_EXPORT_HEADERS,
  "整理状態",
  "不足項目",
] as const;

export function paymentExportRow(record: PaymentExportRecord) {
  const businessAmount = businessUseAmount(record.amount, record.businessUsePercent);
  return [
    isoDate(record.paidAt),
    record.subscriptionNameSnapshot,
    String(record.amount),
    String(record.businessUsePercent),
    String(businessAmount),
    String(record.amount - businessAmount),
    record.categoryNameSnapshot ?? "",
    record.paymentMethodNameSnapshot ?? "",
    record.accountingLabel ?? "",
    record.referenceNumber ?? "",
    record.referenceUrl ?? "",
    record.memo ?? "",
  ];
}

export function monthlyPaymentExportRow(record: PaymentExportRecord) {
  const missing = paymentOrganizationMissing(record);
  return [
    ...paymentExportRow(record),
    missing.length === 0 ? "整理済み" : "要整理",
    missing.join("・"),
  ];
}
