import { createHmac } from "node:crypto";
import {
  AUTH_RATE_LIMIT_MAX_ATTEMPTS,
  AUTH_RATE_LIMIT_MAX_IDENTIFIERS,
  AUTH_RATE_LIMIT_WINDOW_MS,
} from "./app-constants.ts";

const failedAttemptsByKey = new Map<string, number[]>();

function pruneExpiredAttempts(now: number) {
  for (const [key, attempts] of failedAttemptsByKey) {
    const recentAttempts = attempts.filter((attempt) => now - attempt < AUTH_RATE_LIMIT_WINDOW_MS);
    if (recentAttempts.length === 0) failedAttemptsByKey.delete(key);
    else failedAttemptsByKey.set(key, recentAttempts);
  }
}

export function authAttemptKey(email: string, clientIdentifier: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`${email.trim().toLowerCase()}\n${clientIdentifier}`)
    .digest("hex");
}

export function isAuthRateLimited(key: string, now = Date.now()) {
  pruneExpiredAttempts(now);
  return (failedAttemptsByKey.get(key) ?? []).length >= AUTH_RATE_LIMIT_MAX_ATTEMPTS;
}

export function recordFailedAuthAttempt(key: string, now = Date.now()) {
  pruneExpiredAttempts(now);
  if (failedAttemptsByKey.size >= AUTH_RATE_LIMIT_MAX_IDENTIFIERS && !failedAttemptsByKey.has(key)) {
    const oldestKey = failedAttemptsByKey.keys().next().value;
    if (oldestKey) failedAttemptsByKey.delete(oldestKey);
  }
  const attempts = failedAttemptsByKey.get(key) ?? [];
  attempts.push(now);
  failedAttemptsByKey.set(key, attempts);
}

export function clearFailedAuthAttempts(key: string) {
  failedAttemptsByKey.delete(key);
}

export function resetAuthRateLimitForTests() {
  failedAttemptsByKey.clear();
}
