import assert from "node:assert/strict";
import test from "node:test";
import { hasTrustedRequestOrigin, requiresCsrfValidation } from "./csrf.ts";

test("状態変更APIだけをCSRF検証対象にする", () => {
  assert.equal(requiresCsrfValidation("/api/subscriptions", "POST"), true);
  assert.equal(
    requiresCsrfValidation("/api/subscriptions/id.with.dot", "DELETE"),
    true,
  );
  assert.equal(requiresCsrfValidation("/api/subscriptions", "GET"), false);
  assert.equal(requiresCsrfValidation("/dashboard", "POST"), false);
});

test("署名検証を持つ外部ジョブだけをCSRF検証対象外にする", () => {
  assert.equal(requiresCsrfValidation("/api/stripe/webhook", "POST"), false);
  assert.equal(
    requiresCsrfValidation("/api/notifications/send", "POST"),
    false,
  );
  assert.equal(
    requiresCsrfValidation("/api/stripe/webhook/extra", "POST"),
    true,
  );
});

test("設定済みオリジンと一致する送信元だけを許可する", () => {
  const base = {
    requestUrl: "http://127.0.0.1:3000/api/settings/profile",
    refererHeader: null,
    configuredUrls: ["https://subsclist.shinji.work/path", null],
  };
  assert.equal(
    hasTrustedRequestOrigin({
      ...base,
      originHeader: "https://subsclist.shinji.work",
    }),
    true,
  );
  assert.equal(
    hasTrustedRequestOrigin({
      ...base,
      originHeader: "https://attacker.example",
    }),
    false,
  );
  assert.equal(
    hasTrustedRequestOrigin({ ...base, originHeader: "null" }),
    false,
  );
});

test("Originがない場合はRefererを検証し、両方なければ拒否する", () => {
  const base = {
    requestUrl: "http://localhost:3000/api/settings/profile",
    originHeader: null,
    configuredUrls: ["http://localhost:3000"],
  };
  assert.equal(
    hasTrustedRequestOrigin({
      ...base,
      refererHeader: "http://localhost:3000/settings",
    }),
    true,
  );
  assert.equal(
    hasTrustedRequestOrigin({
      ...base,
      refererHeader: "https://attacker.example/settings",
    }),
    false,
  );
  assert.equal(
    hasTrustedRequestOrigin({ ...base, refererHeader: null }),
    false,
  );
});

test("有効な設定URLがない開発環境ではリクエストURLを基準にする", () => {
  assert.equal(
    hasTrustedRequestOrigin({
      requestUrl: "http://localhost:3000/api/auth/login",
      originHeader: "http://localhost:3000",
      refererHeader: null,
      configuredUrls: ["invalid-url"],
    }),
    true,
  );
});
