import assert from "node:assert/strict";
import test from "node:test";
import { isAcceptableJobSecret, isAuthorizedJobRequest } from "./job-secret.ts";

const validSecret = "0123456789abcdef0123456789abcdef";

test("job secrets must be sufficiently long, clean, and non-placeholder values", () => {
  assert.equal(isAcceptableJobSecret(validSecret), true);
  assert.equal(isAcceptableJobSecret("short"), false);
  assert.equal(isAcceptableJobSecret("replace-with-random-secret-for-cron"), false);
  assert.equal(isAcceptableJobSecret(` ${validSecret}`), false);
  assert.equal(isAcceptableJobSecret(`${validSecret}\n`), false);
});

test("job bearer authorization rejects invalid configured secrets and mismatched tokens", () => {
  assert.equal(isAuthorizedJobRequest(validSecret, `Bearer ${validSecret}`), true);
  assert.equal(isAuthorizedJobRequest(validSecret, "Bearer another-secret"), false);
  assert.equal(isAuthorizedJobRequest("short", "Bearer short"), false);
  assert.equal(isAuthorizedJobRequest("replace-with-random-secret-for-cron", "Bearer replace-with-random-secret-for-cron"), false);
  assert.equal(isAuthorizedJobRequest(validSecret, null), false);
});
