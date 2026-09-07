import {
  BILLING_RATE_LIMIT_MAX_IDENTIFIERS,
  BILLING_RATE_LIMIT_MAX_REQUESTS,
  BILLING_RATE_LIMIT_WINDOW_MS,
} from "./app-constants.ts";

const attemptsByOperation = new Map<string, number[]>();

function pruneExpiredAttempts(now: number) {
  for (const [key, attempts] of attemptsByOperation) {
    const recent = attempts.filter(
      (attempt) => now - attempt < BILLING_RATE_LIMIT_WINDOW_MS,
    );
    if (recent.length === 0) attemptsByOperation.delete(key);
    else attemptsByOperation.set(key, recent);
  }
}

export function claimBillingOperation(key: string, now = Date.now()) {
  pruneExpiredAttempts(now);
  const attempts = attemptsByOperation.get(key) ?? [];
  if (attempts.length >= BILLING_RATE_LIMIT_MAX_REQUESTS) {
    return {
      limited: true as const,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(
          (BILLING_RATE_LIMIT_WINDOW_MS - (now - attempts[0])) / 1_000,
        ),
      ),
    };
  }

  if (
    attemptsByOperation.size >= BILLING_RATE_LIMIT_MAX_IDENTIFIERS &&
    !attemptsByOperation.has(key)
  ) {
    const oldestKey = attemptsByOperation.keys().next().value;
    if (oldestKey) attemptsByOperation.delete(oldestKey);
  }
  attempts.push(now);
  attemptsByOperation.set(key, attempts);
  return { limited: false as const, retryAfterSeconds: 0 };
}

export function resetBillingRateLimitForTests() {
  attemptsByOperation.clear();
}
