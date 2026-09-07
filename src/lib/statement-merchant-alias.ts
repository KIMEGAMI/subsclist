import { z } from "zod";
import {
  MAX_STATEMENT_MERCHANT_ALIAS_LENGTH,
  MAX_STATEMENT_MERCHANT_LABEL_LENGTH,
  MIN_STATEMENT_MERCHANT_ALIAS_LENGTH,
} from "./app-constants.ts";
import { normalizeStatementMerchant } from "./statement-import.ts";

export const statementMerchantLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_STATEMENT_MERCHANT_LABEL_LENGTH);

export const statementMerchantAliasMutationSchema = z.object({
  merchant: statementMerchantLabelSchema,
});

export type StatementMerchantAliasData = {
  merchantLabel: string;
  normalizedMerchant: string;
};

export function statementMerchantAliasData(
  merchant: string,
): StatementMerchantAliasData | null {
  const merchantLabel = merchant.trim().normalize("NFKC");
  const normalizedMerchant = normalizeStatementMerchant(merchantLabel);
  if (
    normalizedMerchant.length < MIN_STATEMENT_MERCHANT_ALIAS_LENGTH
    || normalizedMerchant.length > MAX_STATEMENT_MERCHANT_ALIAS_LENGTH
  ) return null;
  return { merchantLabel, normalizedMerchant };
}

export type StatementMerchantAliasWriteInput = {
  subscriptionId: string;
  merchant?: string;
  rememberMerchantAlias: boolean;
};

export type StatementMerchantAliasWriteResult =
  | { ok: true; aliases: Array<StatementMerchantAliasData & { subscriptionId: string }> }
  | { ok: false; message: string };

export function buildStatementMerchantAliasWrites(
  items: readonly StatementMerchantAliasWriteInput[],
): StatementMerchantAliasWriteResult {
  const aliases = new Map<string, StatementMerchantAliasData & { subscriptionId: string }>();
  for (const item of items) {
    if (!item.rememberMerchantAlias) continue;
    const parsed = statementMerchantLabelSchema.safeParse(item.merchant);
    const data = parsed.success ? statementMerchantAliasData(parsed.data) : null;
    if (!data) {
      return { ok: false, message: "記憶する明細名義を確認してください。" };
    }
    const existing = aliases.get(data.normalizedMerchant);
    if (existing && existing.subscriptionId !== item.subscriptionId) {
      return { ok: false, message: "同じ明細名義を複数の契約へ記憶することはできません。" };
    }
    aliases.set(data.normalizedMerchant, { ...data, subscriptionId: item.subscriptionId });
  }
  return { ok: true, aliases: [...aliases.values()] };
}
