import { createHmac } from "node:crypto";
import {
  AUTH_MAIL_RATE_LIMIT_CLIENT_MAX,
  AUTH_MAIL_RATE_LIMIT_COOLDOWN_SECONDS,
  AUTH_MAIL_RATE_LIMIT_MAX_IDENTIFIERS,
  AUTH_MAIL_RATE_LIMIT_RECIPIENT_MAX,
  AUTH_MAIL_RATE_LIMIT_WINDOW_MS,
} from "./app-constants.ts";

type AuthMailKeys = {
  recipientKey: string;
  clientKey: string;
};

const attemptsByKey = new Map<string, number[]>();

function hash(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function prune(now: number) {
  for (const [key, attempts] of attemptsByKey) {
    const recent = attempts.filter((attempt) => now - attempt < AUTH_MAIL_RATE_LIMIT_WINDOW_MS);
    if (recent.length === 0) attemptsByKey.delete(key);
    else attemptsByKey.set(key, recent);
  }
}

function trimMap() {
  while (attemptsByKey.size >= AUTH_MAIL_RATE_LIMIT_MAX_IDENTIFIERS) {
    const oldestKey = attemptsByKey.keys().next().value;
    if (!oldestKey) return;
    attemptsByKey.delete(oldestKey);
  }
}

export function authMailKeys(email: string, clientIdentifier: string, secret: string): AuthMailKeys {
  return {
    recipientKey: `recipient:${hash(email.trim().toLowerCase(), secret)}`,
    clientKey: `client:${hash(clientIdentifier, secret)}`,
  };
}

export function authMailRateLimit(keys: AuthMailKeys, now = Date.now()) {
  prune(now);
  const recipientAttempts = attemptsByKey.get(keys.recipientKey) ?? [];
  const clientAttempts = attemptsByKey.get(keys.clientKey) ?? [];
  const latestAttempt = Math.max(recipientAttempts.at(-1) ?? 0, clientAttempts.at(-1) ?? 0);
  const cooldownMs = AUTH_MAIL_RATE_LIMIT_COOLDOWN_SECONDS * 1_000;
  const cooldownRemaining = latestAttempt ? cooldownMs - (now - latestAttempt) : 0;
  const recipientWindowRemaining = recipientAttempts.length >= AUTH_MAIL_RATE_LIMIT_RECIPIENT_MAX
    ? AUTH_MAIL_RATE_LIMIT_WINDOW_MS - (now - recipientAttempts[0])
    : 0;
  const clientWindowRemaining = clientAttempts.length >= AUTH_MAIL_RATE_LIMIT_CLIENT_MAX
    ? AUTH_MAIL_RATE_LIMIT_WINDOW_MS - (now - clientAttempts[0])
    : 0;
  const limited = cooldownRemaining > 0
    || recipientAttempts.length >= AUTH_MAIL_RATE_LIMIT_RECIPIENT_MAX
    || clientAttempts.length >= AUTH_MAIL_RATE_LIMIT_CLIENT_MAX;

  return {
    limited,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil(Math.max(0, cooldownRemaining, recipientWindowRemaining, clientWindowRemaining) / 1_000),
    ),
  };
}

export function recordAuthMailAttempt(keys: AuthMailKeys, now = Date.now()) {
  prune(now);
  for (const key of [keys.recipientKey, keys.clientKey]) {
    if (!attemptsByKey.has(key)) trimMap();
    attemptsByKey.set(key, [...(attemptsByKey.get(key) ?? []), now]);
  }
}

export function releaseAuthMailAttempt(keys: AuthMailKeys, attemptedAt: number) {
  for (const key of [keys.recipientKey, keys.clientKey]) {
    const attempts = attemptsByKey.get(key) ?? [];
    const index = attempts.lastIndexOf(attemptedAt);
    if (index >= 0) attempts.splice(index, 1);
    if (attempts.length === 0) attemptsByKey.delete(key);
    else attemptsByKey.set(key, attempts);
  }
}

export function resetAuthMailRateLimitForTests() {
  attemptsByKey.clear();
}
