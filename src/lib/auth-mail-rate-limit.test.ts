import assert from "node:assert/strict";
import test from "node:test";
import {
  authMailKeys,
  authMailRateLimit,
  recordAuthMailAttempt,
  releaseAuthMailAttempt,
  resetAuthMailRateLimitForTests,
} from "./auth-mail-rate-limit.ts";

const keys = authMailKeys("USER@example.com", "127.0.0.1", "test-secret");

test("認証メールは連続送信を60秒間制限する", () => {
  resetAuthMailRateLimitForTests();
  recordAuthMailAttempt(keys, 1_000);
  assert.equal(authMailRateLimit(keys, 30_000).limited, true);
  assert.equal(authMailRateLimit(keys, 62_000).limited, false);
});

test("送信失敗として予約を戻すと直ちに再試行できる", () => {
  resetAuthMailRateLimitForTests();
  recordAuthMailAttempt(keys, 1_000);
  releaseAuthMailAttempt(keys, 1_000);
  assert.equal(authMailRateLimit(keys, 1_001).limited, false);
});

test("同じ宛先への認証メールは1時間に3回まで", () => {
  resetAuthMailRateLimitForTests();
  recordAuthMailAttempt(keys, 1_000);
  recordAuthMailAttempt(keys, 62_000);
  recordAuthMailAttempt(keys, 123_000);
  const limited = authMailRateLimit(keys, 184_000);
  assert.equal(limited.limited, true);
  assert.equal(limited.retryAfterSeconds, 3_417);
  assert.equal(authMailRateLimit(keys, 3_602_000).limited, false);
});
