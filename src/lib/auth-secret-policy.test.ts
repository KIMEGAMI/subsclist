import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { isAuthSecretAcceptable } from "./auth-secret-policy.ts";

test("長さを満たしプレースホルダー表現を含まない署名鍵を受け付ける", () => {
  assert.equal(isAuthSecretAcceptable(crypto.randomBytes(32).toString("base64url")), true);
});

test("短い署名鍵と置換用プレースホルダーを拒否する", () => {
  assert.equal(isAuthSecretAcceptable("short-secret"), false);
  assert.equal(isAuthSecretAcceptable("replace_with_a_random_secret_value"), false);
  assert.equal(isAuthSecretAcceptable("your-secret-goes-here-please-change"), false);
});
