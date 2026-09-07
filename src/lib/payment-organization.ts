export type PaymentOrganizationRecord = {
  accountingLabel: string | null;
  referenceNumber: string | null;
  referenceUrl: string | null;
};

export type PaymentOrganizationSummary = {
  totalCount: number;
  labeledCount: number;
  evidencedCount: number;
  organizedCount: number;
  missingCount: number;
  completionPercent: number;
};

function hasValue(value: string | null) {
  return Boolean(value?.trim());
}

export function paymentOrganizationMissing(record: PaymentOrganizationRecord) {
  const missing: string[] = [];
  if (!hasValue(record.accountingLabel)) missing.push("整理用科目");
  if (!hasValue(record.referenceNumber) && !hasValue(record.referenceUrl)) missing.push("証憑");
  return missing;
}

export function summarizePaymentOrganization(records: PaymentOrganizationRecord[]): PaymentOrganizationSummary {
  const labeledCount = records.filter((record) => hasValue(record.accountingLabel)).length;
  const evidencedCount = records.filter((record) => hasValue(record.referenceNumber) || hasValue(record.referenceUrl)).length;
  const organizedCount = records.filter((record) => paymentOrganizationMissing(record).length === 0).length;
  return {
    totalCount: records.length,
    labeledCount,
    evidencedCount,
    organizedCount,
    missingCount: records.length - organizedCount,
    completionPercent: records.length === 0 ? 0 : Math.round((organizedCount / records.length) * 100),
  };
}
