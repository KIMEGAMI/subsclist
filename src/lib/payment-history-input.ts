import { z } from "zod";
import {
  ALLOWED_URL_PROTOCOLS,
  MAX_ACCOUNTING_LABEL_LENGTH,
  MAX_PAYMENT_HISTORY_MEMO_LENGTH,
  MAX_PAYMENT_REFERENCE_NUMBER_LENGTH,
  MAX_SUBSCRIPTION_PRICE,
  MAX_URL_LENGTH,
} from "./app-constants.ts";
import { parseIsoCalendarDate } from "./calendar-date.ts";

export function optionalPaymentReferenceUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (ALLOWED_URL_PROTOCOLS as readonly string[]).includes(url.protocol)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export const paymentHistoryDetailsSchema = z.object({
  amount: z.coerce.number().int().min(0).max(MAX_SUBSCRIPTION_PRICE),
  paidAt: z.string().refine((value) => parseIsoCalendarDate(value) !== null),
  accountingLabel: z.string().trim().max(MAX_ACCOUNTING_LABEL_LENGTH).optional(),
  referenceNumber: z.string().trim().max(MAX_PAYMENT_REFERENCE_NUMBER_LENGTH).optional(),
  referenceUrl: z.string().trim().max(MAX_URL_LENGTH).refine((value) => !value || optionalPaymentReferenceUrl(value) !== null).optional(),
  memo: z.string().trim().max(MAX_PAYMENT_HISTORY_MEMO_LENGTH).optional(),
});

export const PAYMENT_HISTORY_DUPLICATE_CODE = "DUPLICATE_PAYMENT_HISTORY";

export const paymentHistoryMutationSchema = paymentHistoryDetailsSchema.extend({
  allowDuplicate: z.literal(true).optional(),
});

export type PaymentHistoryDetails = z.infer<typeof paymentHistoryDetailsSchema>;

export function paymentHistoryDetailsData(details: PaymentHistoryDetails) {
  return {
    amount: details.amount,
    paidAt: parseIsoCalendarDate(details.paidAt) as Date,
    accountingLabel: details.accountingLabel || null,
    referenceNumber: details.referenceNumber || null,
    referenceUrl: optionalPaymentReferenceUrl(details.referenceUrl),
    memo: details.memo || null,
  };
}

export function paymentHistoryDuplicateFilter(
  userId: string,
  subscriptionId: string,
  details: PaymentHistoryDetails,
  excludeId?: string,
) {
  const normalized = paymentHistoryDetailsData(details);
  return {
    userId,
    subscriptionId,
    amount: normalized.amount,
    paidAt: normalized.paidAt,
    ...(excludeId ? { id: { not: excludeId } } : {}),
  };
}
