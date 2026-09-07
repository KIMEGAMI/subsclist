import { businessUseAmount } from "./subscription-business.ts";
import { paymentOrganizationMissing, summarizePaymentOrganization } from "./payment-organization.ts";
import { japanCalendarDate } from "./subscription-usage.ts";

export type AnnualBusinessPayment = {
  amount: number;
  paidAt: Date;
  businessUsePercent: number;
  categoryNameSnapshot: string | null;
  accountingLabel: string | null;
  referenceNumber: string | null;
  referenceUrl: string | null;
};

export function buildAnnualBusinessReport(
  payments: AnnualBusinessPayment[],
  year: number,
) {
  const selected = payments.filter(
    (payment) => japanCalendarDate(payment.paidAt).getUTCFullYear() === year,
  );
  const totalPaid = selected.reduce((sum, payment) => sum + payment.amount, 0);
  const businessPaid = selected.reduce(
    (sum, payment) => sum + businessUseAmount(payment.amount, payment.businessUsePercent),
    0,
  );
  const organization = summarizePaymentOrganization(selected);

  const months = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const rows = selected.filter(
      (payment) => japanCalendarDate(payment.paidAt).getUTCMonth() + 1 === month,
    );
    const paidAmount = rows.reduce((sum, payment) => sum + payment.amount, 0);
    const businessAmount = rows.reduce(
      (sum, payment) => sum + businessUseAmount(payment.amount, payment.businessUsePercent),
      0,
    );
    return { month, paymentCount: rows.length, paidAmount, businessAmount };
  });

  const categoryMap = new Map<string, {
    paymentCount: number;
    paidAmount: number;
    businessAmount: number;
    missingCount: number;
  }>();
  for (const payment of selected) {
    const category = payment.categoryNameSnapshot?.trim() || "未分類";
    const current = categoryMap.get(category) ?? {
      paymentCount: 0,
      paidAmount: 0,
      businessAmount: 0,
      missingCount: 0,
    };
    current.paymentCount += 1;
    current.paidAmount += payment.amount;
    current.businessAmount += businessUseAmount(payment.amount, payment.businessUsePercent);
    if (paymentOrganizationMissing(payment).length > 0) current.missingCount += 1;
    categoryMap.set(category, current);
  }

  const categories = [...categoryMap.entries()]
    .map(([name, values]) => ({
      name,
      ...values,
      sharePercent: totalPaid === 0 ? 0 : Math.round(values.paidAmount / totalPaid * 100),
    }))
    .sort((left, right) => right.paidAmount - left.paidAmount || left.name.localeCompare(right.name, "ja"));

  return {
    year,
    paymentCount: selected.length,
    totalPaid,
    businessPaid,
    personalPaid: totalPaid - businessPaid,
    organization,
    months,
    categories,
  };
}
