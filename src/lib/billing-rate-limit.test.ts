import assert from "node:assert/strict";
import test from "node:test";
import {
  claimBillingOperation,
  resetBillingRateLimitForTests,
} from "./billing-rate-limit.ts";

test("同じユーザーの同じ課金操作は1分間に5回まで", () => {
  resetBillingRateLimitForTests();
  const now = 1_000_000;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(
      claimBillingOperation("checkout:user-1", now + attempt).limited,
      false,
    );
  }
  const limited = claimBillingOperation("checkout:user-1", now + 5);
  assert.equal(limited.limited, true);
  assert.equal(limited.retryAfterSeconds, 60);
  assert.equal(
    claimBillingOperation("checkout:user-1", now + 60_001).limited,
    false,
  );
});

test("操作種別とユーザーが異なれば別々に制限する", () => {
  resetBillingRateLimitForTests();
  const now = 2_000_000;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    claimBillingOperation("checkout:user-1", now + attempt);
  }
  assert.equal(claimBillingOperation("portal:user-1", now + 5).limited, false);
  assert.equal(claimBillingOperation("checkout:user-2", now + 5).limited, false);
});
