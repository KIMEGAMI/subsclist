import assert from "node:assert/strict";
import test from "node:test";
import { findSensitiveAccountExportKey, serializeAccountDataExport } from "./account-data-export.ts";

test("利用者データをバージョン付きJSONへ変換する", () => {
  const json = serializeAccountDataExport({
    profile: { email: "user@example.com", plan: "PREMIUM" },
    subscriptions: [{ id: "sub-1", name: "Example" }],
  }, new Date("2026-08-30T00:00:00.000Z"));
  const parsed = JSON.parse(json) as { version: number; exportedAt: string; account: { profile: { email: string } } };
  assert.equal(parsed.version, 2);
  assert.equal(parsed.exportedAt, "2026-08-30T00:00:00.000Z");
  assert.equal(parsed.account.profile.email, "user@example.com");
});

test("入れ子や配列内の認証・Stripe機密キーを検出する", () => {
  assert.equal(findSensitiveAccountExportKey({ profile: { passwordHash: "secret" } }), "passwordHash");
  assert.equal(findSensitiveAccountExportKey({ users: [{ stripeCustomerId: "cus_1" }] }), "stripeCustomerId");
  assert.equal(findSensitiveAccountExportKey({ device: { tokenHash: "hash" } }), "tokenHash");
});

test("機密キーを含むデータは書き出さない", () => {
  assert.throws(
    () => serializeAccountDataExport({ profile: { sessionVersion: 2 } }),
    /SENSITIVE_ACCOUNT_EXPORT_KEY:sessionVersion/,
  );
});
