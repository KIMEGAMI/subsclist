import {
  MAX_BUSINESS_USE_PERCENT,
  MIN_BUSINESS_USE_PERCENT,
} from "./app-constants.ts";

export function normalizeBusinessUsePercent(value: number) {
  if (!Number.isFinite(value)) return MIN_BUSINESS_USE_PERCENT;
  return Math.min(
    MAX_BUSINESS_USE_PERCENT,
    Math.max(MIN_BUSINESS_USE_PERCENT, Math.round(value)),
  );
}

export function businessUseAmount(amount: number, businessUsePercent: number) {
  return Math.round(
    (amount * normalizeBusinessUsePercent(businessUsePercent)) /
      MAX_BUSINESS_USE_PERCENT,
  );
}

export function businessUseLabel(businessUsePercent: number) {
  const normalized = normalizeBusinessUsePercent(businessUsePercent);
  if (normalized === MIN_BUSINESS_USE_PERCENT) return "個人利用";
  if (normalized === MAX_BUSINESS_USE_PERCENT) return "仕事利用";
  return `仕事・個人兼用（仕事 ${normalized}%）`;
}
