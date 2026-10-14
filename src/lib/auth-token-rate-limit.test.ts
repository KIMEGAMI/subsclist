import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_TOKEN_LOOKUP_MAX_ATTEMPTS,
  AUTH_TOKEN_LOOKUP_WINDOW_MS,
} from "./app-constants.ts";
import {
  authTokenLookupKey,
  claimAuthTokenLookup,
  resetAuthTokenLookupRateLimitForTests,
} from "./auth-token-rate-limit.ts";

test.afterEach(() => resetAuthTokenLookupRateLimitForTests());

test("token lookup負荷を送信元単位で制限し、期限後に再許可する", () => {
  const key = authTokenLookupKey("client-address", "test-secret");
  const now = 1_000_000;
  for (let count = 0; count < AUTH_TOKEN_LOOKUP_MAX_ATTEMPTS; count += 1) {
    assert.equal(claimAuthTokenLookup(key, now + count), true);
  }
  assert.equal(claimAuthTokenLookup(key, now + 20), false);
  assert.equal(
    claimAuthTokenLookup(key, now + AUTH_TOKEN_LOOKUP_WINDOW_MS + 1),
    true,
  );
});

test("送信元キーは秘密鍵付きハッシュで保存用に生成する", () => {
  assert.equal(
    authTokenLookupKey("client-address", "secret"),
    authTokenLookupKey("client-address", "secret"),
  );
  assert.notEqual(
    authTokenLookupKey("client-address", "secret"),
    authTokenLookupKey("other-address", "secret"),
  );
});
