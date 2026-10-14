import assert from "node:assert/strict";
import test from "node:test";
import { isNewsFeedbackRateLimited, resetNewsFeedbackRateLimitForTests } from "./news-feedback-rate-limit.ts";

test.afterEach(() => resetNewsFeedbackRateLimitForTests());

test("ニュースFeedbackは利用者ごとに1分30回まで許可する", () => {
  for (let count = 0; count < 30; count += 1) assert.equal(isNewsFeedbackRateLimited("user-1", 1_000), false);
  assert.equal(isNewsFeedbackRateLimited("user-1", 1_000), true);
  assert.equal(isNewsFeedbackRateLimited("user-2", 1_000), false);
  assert.equal(isNewsFeedbackRateLimited("user-1", 61_000), false);
});
