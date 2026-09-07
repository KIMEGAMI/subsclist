import { z } from "zod";
import {
  MAX_BUSINESS_USE_PERCENT,
  MIN_BUSINESS_USE_PERCENT,
} from "./app-constants.ts";

export const BULK_SUBSCRIPTION_UPDATE_MAX_ITEMS = 50;
export const SUBSCRIPTION_RECORD_ID_MAX_LENGTH = 191;

const recordIdSchema = z.string().trim().min(1).max(SUBSCRIPTION_RECORD_ID_MAX_LENGTH);

export const bulkSubscriptionUpdateSchema = z.object({
  subscriptionIds: z
    .array(recordIdSchema)
    .min(1)
    .max(BULK_SUBSCRIPTION_UPDATE_MAX_ITEMS)
    .refine((ids) => new Set(ids).size === ids.length, "契約IDが重複しています。"),
  categoryId: recordIdSchema.nullable().optional(),
  paymentMethodId: recordIdSchema.nullable().optional(),
  usageFrequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "RARELY", "UNKNOWN"]).optional(),
  priority: z.enum(["ESSENTIAL", "USEFUL", "OPTIONAL", "UNKNOWN"]).optional(),
  businessUsePercent: z
    .number()
    .int()
    .min(MIN_BUSINESS_USE_PERCENT)
    .max(MAX_BUSINESS_USE_PERCENT)
    .optional(),
  markReviewed: z.literal(true).optional(),
}).refine(
  (data) => data.categoryId !== undefined
    || data.paymentMethodId !== undefined
    || data.usageFrequency !== undefined
    || data.priority !== undefined
    || data.businessUsePercent !== undefined
    || data.markReviewed === true,
  "更新する項目を選択してください。",
);

export type BulkSubscriptionUpdateInput = z.infer<typeof bulkSubscriptionUpdateSchema>;

export function bulkSubscriptionUpdateData(input: BulkSubscriptionUpdateInput) {
  return {
    categoryId: input.categoryId,
    paymentMethodId: input.paymentMethodId,
    usageFrequency: input.usageFrequency,
    priority: input.priority,
    businessUsePercent: input.businessUsePercent,
    lastReviewedAt: input.markReviewed ? new Date() : undefined,
  };
}

export function selectedIdsAreVisible(selectedIds: string[], visibleIds: string[]) {
  const visible = new Set(visibleIds);
  return selectedIds.every((id) => visible.has(id));
}
