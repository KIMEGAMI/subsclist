import assert from "node:assert/strict";
import test from "node:test";
import {
  getContactClientKey,
  hasContactNgPhrase,
  isContactRateLimited,
  recordContactAttempt,
  resetContactRateLimitForTests,
} from "./contact-guard.ts";

test("問い合わせの明白なスパム語句を検知する", () => {
  assert.equal(hasContactNgPhrase("Please BUY BACKLINKS for your site."), true);
  assert.equal(hasContactNgPhrase("Stripeの決済設定について質問があります。"), false);
});

test("問い合わせの連投は10分間に3件まで許可する", () => {
  resetContactRateLimitForTests();
  const clientKey = getContactClientKey("127.0.0.1", "test-secret");
  const now = 1_000_000;

  assert.equal(isContactRateLimited(clientKey, now), false);
  recordContactAttempt(clientKey, now);
  recordContactAttempt(clientKey, now + 1);
  recordContactAttempt(clientKey, now + 2);
  assert.equal(isContactRateLimited(clientKey, now + 3), true);
  assert.equal(isContactRateLimited(clientKey, now + 10 * 60 * 1_000 + 3), false);
});
