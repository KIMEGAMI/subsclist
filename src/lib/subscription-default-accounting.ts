import { z } from "zod";
import { MAX_ACCOUNTING_LABEL_LENGTH } from "./app-constants.ts";

export const defaultAccountingLabelSchema = z
  .string()
  .trim()
  .max(MAX_ACCOUNTING_LABEL_LENGTH)
  .optional();

export const rememberAccountingLabelSchema = z.preprocess(
  (value) => {
    if (value === "true") return true;
    if (value === "false" || value === "" || value === null || value === undefined) return false;
    return value;
  },
  z.boolean(),
);

export function normalizeDefaultAccountingLabel(value?: string) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}
