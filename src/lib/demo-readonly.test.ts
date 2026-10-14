import assert from "node:assert/strict";
import test from "node:test";
import { shouldBlockDemoMutation } from "./demo-readonly.ts";

test("デモの更新HTTPメソッドを拒否する", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(shouldBlockDemoMutation(method, "/api/subscriptions"), true);
  }
  assert.equal(shouldBlockDemoMutation("GET", "/api/subscriptions"), false);
});

test("ログアウト・認証切替・お問い合わせだけはデモセッションから許可する", () => {
  for (const pathname of [
    "/api/auth/demo-login",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/register",
    "/api/contact",
  ]) {
    assert.equal(shouldBlockDemoMutation("POST", pathname), false);
  }
  assert.equal(shouldBlockDemoMutation("POST", "/dashboard"), true);
});
