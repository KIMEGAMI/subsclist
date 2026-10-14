import {
  NEWS_MANUAL_SYNC_RATE_LIMIT_MAX_IDENTIFIERS,
  NEWS_MANUAL_SYNC_RATE_LIMIT_MAX_REQUESTS,
  NEWS_MANUAL_SYNC_RATE_LIMIT_WINDOW_MS,
} from "./app-constants.ts";

const requests = new Map<string, number[]>();

export function isNewsManualSyncRateLimited(userId: string, now = Date.now()) {
  const recent = (requests.get(userId) ?? []).filter(
    (timestamp) => now - timestamp < NEWS_MANUAL_SYNC_RATE_LIMIT_WINDOW_MS,
  );
  requests.delete(userId);
  if (
    recent.length === 0 &&
    requests.size >= NEWS_MANUAL_SYNC_RATE_LIMIT_MAX_IDENTIFIERS
  ) {
    const oldestUserId = requests.keys().next().value;
    if (oldestUserId !== undefined) requests.delete(oldestUserId);
  }
  if (recent.length >= NEWS_MANUAL_SYNC_RATE_LIMIT_MAX_REQUESTS) {
    requests.set(userId, recent);
    return true;
  }
  recent.push(now);
  requests.set(userId, recent);
  return false;
}

export function resetNewsManualSyncRateLimitForTests() {
  requests.clear();
}
