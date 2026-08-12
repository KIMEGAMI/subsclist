import { createHmac } from "node:crypto";
import {
  CONTACT_RATE_LIMIT_MAX_IDENTIFIERS,
  CONTACT_RATE_LIMIT_MAX_REQUESTS,
  CONTACT_RATE_LIMIT_WINDOW_MS,
} from "./app-constants.ts";

const contactNgPhrases = [
  "viagra",
  "cialis",
  "onlyfans",
  "casino bonus",
  "crypto giveaway",
  "buy backlinks",
  "seo backlinks",
] as const;

const attemptsByClient = new Map<string, number[]>();

function normalizeText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

function pruneExpiredAttempts(now: number) {
  for (const [clientKey, attempts] of attemptsByClient) {
    const recentAttempts = attempts.filter((attempt) => now - attempt < CONTACT_RATE_LIMIT_WINDOW_MS);
    if (recentAttempts.length === 0) attemptsByClient.delete(clientKey);
    else attemptsByClient.set(clientKey, recentAttempts);
  }
}

export function hasContactNgPhrase(message: string) {
  const normalizedMessage = normalizeText(message);
  return contactNgPhrases.some((phrase) => normalizedMessage.includes(phrase));
}

export function getContactClientKey(clientIdentifier: string, secret: string) {
  return createHmac("sha256", secret).update(clientIdentifier).digest("hex");
}

export function isContactRateLimited(clientKey: string, now = Date.now()) {
  pruneExpiredAttempts(now);
  return (attemptsByClient.get(clientKey) ?? []).length >= CONTACT_RATE_LIMIT_MAX_REQUESTS;
}

export function recordContactAttempt(clientKey: string, now = Date.now()) {
  pruneExpiredAttempts(now);
  if (attemptsByClient.size >= CONTACT_RATE_LIMIT_MAX_IDENTIFIERS && !attemptsByClient.has(clientKey)) {
    const oldestKey = attemptsByClient.keys().next().value;
    if (oldestKey) attemptsByClient.delete(oldestKey);
  }
  const attempts = attemptsByClient.get(clientKey) ?? [];
  attempts.push(now);
  attemptsByClient.set(clientKey, attempts);
}

export function resetContactRateLimitForTests() {
  attemptsByClient.clear();
}
