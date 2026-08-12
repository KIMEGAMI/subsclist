import assert from "node:assert/strict";
import test from "node:test";
import {
  authAttemptKey,
  clearFailedAuthAttempts,
  isAuthRateLimited,
  recordFailedAuthAttempt,
  resetAuthRateLimitForTests,
} from "./auth-rate-limit.ts";

test("同じログイン試行元は15分間に10回失敗すると制限される", () => {
  resetAuthRateLimitForTests();
  const key = authAttemptKey("user@example.com", "127.0.0.1", "test-secret");
  const now = 1_000_000;
  for (let attempt = 0; attempt < 10; attempt += 1) recordFailedAuthAttempt(key, now + attempt);

  assert.equal(isAuthRateLimited(key, now + 11), true);
  assert.equal(isAuthRateLimited(key, now + 15 * 60 * 1_000 + 11), false);
});

test("ログイン成功時は失敗回数をリセットする", () => {
  resetAuthRateLimitForTests();
  const key = authAttemptKey("user@example.com", "127.0.0.1", "test-secret");
  recordFailedAuthAttempt(key, 1_000_000);
  clearFailedAuthAttempts(key);
  assert.equal(isAuthRateLimited(key, 1_000_001), false);
});
