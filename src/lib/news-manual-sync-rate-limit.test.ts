import assert from "node:assert/strict";
import test from "node:test";
import {
  NEWS_MANUAL_SYNC_RATE_LIMIT_MAX_IDENTIFIERS,
  NEWS_MANUAL_SYNC_RATE_LIMIT_WINDOW_MS,
} from "./app-constants.ts";
import {
  isNewsManualSyncRateLimited,
  resetNewsManualSyncRateLimitForTests,
} from "./news-manual-sync-rate-limit.ts";

test("利用者ごとの同期制限を維持する", () => {
  resetNewsManualSyncRateLimitForTests();
  assert.equal(isNewsManualSyncRateLimited("user-a", 10_000), false);
  assert.equal(isNewsManualSyncRateLimited("user-a", 10_001), true);
  assert.equal(
    isNewsManualSyncRateLimited("user-a", 10_000 + NEWS_MANUAL_SYNC_RATE_LIMIT_WINDOW_MS),
    false,
  );
  resetNewsManualSyncRateLimitForTests();
});

test("同期制限の利用者Mapが上限を超えず、古いキーを追い出す", () => {
  resetNewsManualSyncRateLimitForTests();
  for (let index = 0; index < NEWS_MANUAL_SYNC_RATE_LIMIT_MAX_IDENTIFIERS; index += 1) {
    assert.equal(isNewsManualSyncRateLimited(`user-${index}`, 20_000), false);
  }
  assert.equal(isNewsManualSyncRateLimited("new-user", 20_002), false);
  assert.equal(isNewsManualSyncRateLimited("user-0", 20_003), false);
  resetNewsManualSyncRateLimitForTests();
});
