export const ACCOUNT_DATA_EXPORT_VERSION = 2;

export const SENSITIVE_ACCOUNT_EXPORT_KEYS = new Set([
  "passwordHash",
  "sessionVersion",
  "failedLoginCount",
  "lastFailedLoginAt",
  "lockedUntil",
  "stripeCustomerId",
  "stripeSubscriptionId",
  "tokenHash",
  "trustedLoginDevices",
  "emailVerificationTokens",
  "emailChangeTokens",
  "passwordResetTokens",
]);

export function findSensitiveAccountExportKey(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSensitiveAccountExportKey(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_ACCOUNT_EXPORT_KEYS.has(key)) return key;
    const found = findSensitiveAccountExportKey(item);
    if (found) return found;
  }
  return null;
}

export function serializeAccountDataExport(accountData: Record<string, unknown>, exportedAt = new Date()) {
  const sensitiveKey = findSensitiveAccountExportKey(accountData);
  if (sensitiveKey) throw new Error(`SENSITIVE_ACCOUNT_EXPORT_KEY:${sensitiveKey}`);
  return JSON.stringify({
    format: "SubscList account data",
    version: ACCOUNT_DATA_EXPORT_VERSION,
    exportedAt: exportedAt.toISOString(),
    account: accountData,
  }, null, 2);
}
