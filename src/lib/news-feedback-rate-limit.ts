import {
  NEWS_FEEDBACK_RATE_LIMIT_MAX_IDENTIFIERS,
  NEWS_FEEDBACK_RATE_LIMIT_MAX_REQUESTS,
  NEWS_FEEDBACK_RATE_LIMIT_WINDOW_MS,
} from "./app-constants.ts";

type Counter = { startedAt: number; count: number };
const counters = new Map<string, Counter>();

export function isNewsFeedbackRateLimited(userId: string, now = Date.now()) {
  const current = counters.get(userId);
  if (!current || now - current.startedAt >= NEWS_FEEDBACK_RATE_LIMIT_WINDOW_MS) {
    if (!current && counters.size >= NEWS_FEEDBACK_RATE_LIMIT_MAX_IDENTIFIERS) {
      const oldestKey = counters.keys().next().value;
      if (oldestKey) counters.delete(oldestKey);
    }
    counters.set(userId, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > NEWS_FEEDBACK_RATE_LIMIT_MAX_REQUESTS;
}

export function resetNewsFeedbackRateLimitForTests() {
  counters.clear();
}
