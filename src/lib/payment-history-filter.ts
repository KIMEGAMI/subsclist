import { paymentOrganizationMissing, type PaymentOrganizationRecord } from "./payment-organization.ts";
import { japanCalendarDate } from "./subscription-usage.ts";

export const PAYMENT_HISTORY_DISPLAY_LIMIT = 200;
export const PAYMENT_HISTORY_MIN_YEAR = 2000;

export type PaymentHistoryOrganizationFilter = "ALL" | "MISSING" | "ORGANIZED";
export type PaymentHistoryMissingFilter = "ANY" | "ACCOUNTING" | "EVIDENCE";

export type PaymentHistoryFilterInput = {
  year?: string;
  organization?: string;
  missing?: string;
};

function parseOrganization(value: string | undefined): PaymentHistoryOrganizationFilter {
  if (value === "missing") return "MISSING";
  if (value === "organized") return "ORGANIZED";
  return "ALL";
}

function parseMissing(value: string | undefined): PaymentHistoryMissingFilter {
  if (value === "accounting") return "ACCOUNTING";
  if (value === "evidence") return "EVIDENCE";
  return "ANY";
}

function parseYear(value: string | undefined, currentYear: number) {
  if (!value || !/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return year >= PAYMENT_HISTORY_MIN_YEAR && year <= currentYear ? year : null;
}

export function resolvePaymentHistoryFilter(input: PaymentHistoryFilterInput, referenceDate = new Date()) {
  const reference = japanCalendarDate(referenceDate);
  const currentYear = reference.getUTCFullYear();
  const currentMonth = reference.getUTCMonth();
  const year = parseYear(input.year, currentYear);
  const start = year === null ? new Date(Date.UTC(currentYear, currentMonth, 1)) : new Date(Date.UTC(year, 0, 1));
  const end = year === null ? new Date(Date.UTC(currentYear, currentMonth + 1, 1)) : new Date(Date.UTC(year + 1, 0, 1));
  return {
    year,
    organization: parseOrganization(input.organization),
    missing: parseMissing(input.missing),
    start,
    end,
    periodLabel: year === null ? `${currentYear}年${currentMonth + 1}月` : `${year}年`,
  };
}

export function matchesPaymentHistoryFilter(record: PaymentOrganizationRecord, organization: PaymentHistoryOrganizationFilter, missing: PaymentHistoryMissingFilter) {
  const missingItems = paymentOrganizationMissing(record);
  if (organization === "ORGANIZED") return missingItems.length === 0;
  if (organization === "ALL") return true;
  if (missing === "ACCOUNTING") return missingItems.includes("整理用科目");
  if (missing === "EVIDENCE") return missingItems.includes("証憑");
  return missingItems.length > 0;
}

export function paymentHistoryFilterLabel(organization: PaymentHistoryOrganizationFilter, missing: PaymentHistoryMissingFilter) {
  if (organization === "ORGANIZED") return "整理済み";
  if (organization === "MISSING" && missing === "ACCOUNTING") return "科目不足";
  if (organization === "MISSING" && missing === "EVIDENCE") return "証憑不足";
  if (organization === "MISSING") return "未整理";
  return "すべて";
}
