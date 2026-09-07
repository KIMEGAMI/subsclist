import { z } from "zod";
import { MAX_ACCOUNTING_LABEL_LENGTH } from "./app-constants.ts";

export const PAYMENT_HISTORY_BULK_MAX_ITEMS = 100;
export const PAYMENT_HISTORY_RECORD_ID_MAX_LENGTH = 191;

const recordIdSchema = z.string().trim().min(1).max(PAYMENT_HISTORY_RECORD_ID_MAX_LENGTH);

export const paymentHistoryBulkOrganizationSchema = z.object({
  paymentHistoryIds: z
    .array(recordIdSchema)
    .min(1)
    .max(PAYMENT_HISTORY_BULK_MAX_ITEMS)
    .refine((ids) => new Set(ids).size === ids.length, "支払い履歴IDが重複しています。"),
  accountingLabel: z.string().trim().min(1).max(MAX_ACCOUNTING_LABEL_LENGTH),
});

export type PaymentHistoryBulkOrganizationInput = z.infer<typeof paymentHistoryBulkOrganizationSchema>;
