import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_RATE_LIMIT_MAX_ATTEMPTS,
  AUTH_RATE_LIMIT_WINDOW_MS,
} from "./app-constants.ts";
import {
  authAttemptKey,
  clearFailedAuthAttempts,
  isAuthRateLimited,
  recordFailedAuthAttempt,
  resetAuthRateLimitForTests,
} from "./auth-rate-limit.ts";

test("同じログイン試行元は規定回数失敗すると15分間制限される", () => {
  resetAuthRateLimitForTests();
  const key = authAttemptKey("user@example.com", "127.0.0.1", "test-secret");
  const now = 1_000_000;
  for (let attempt = 0; attempt < AUTH_RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) {
    recordFailedAuthAttempt(key, now + attempt);
  }

  assert.equal(isAuthRateLimited(key, now + AUTH_RATE_LIMIT_MAX_ATTEMPTS), true);
  assert.equal(
    isAuthRateLimited(
      key,
      now + AUTH_RATE_LIMIT_WINDOW_MS + AUTH_RATE_LIMIT_MAX_ATTEMPTS,
    ),
    false,
  );
});

test("ログイン成功時は失敗回数をリセットする", () => {
  resetAuthRateLimitForTests();
  const key = authAttemptKey("user@example.com", "127.0.0.1", "test-secret");
  recordFailedAuthAttempt(key, 1_000_000);
  clearFailedAuthAttempts(key);
  assert.equal(isAuthRateLimited(key, 1_000_001), false);
});
