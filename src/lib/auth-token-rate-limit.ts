import { createHmac } from "node:crypto";
import {
  AUTH_TOKEN_LOOKUP_MAX_ATTEMPTS,
  AUTH_TOKEN_LOOKUP_MAX_IDENTIFIERS,
  AUTH_TOKEN_LOOKUP_WINDOW_MS,
} from "./app-constants.ts";

const attemptsByClient = new Map<string, number[]>();

export function authTokenLookupKey(clientIdentifier: string, secret: string) {
  return createHmac("sha256", secret)
    .update(clientIdentifier.trim() || "unknown")
    .digest("hex");
}

export function claimAuthTokenLookup(key: string, now = Date.now()) {
  const attempts = (attemptsByClient.get(key) ?? []).filter(
    (attempt) => now - attempt < AUTH_TOKEN_LOOKUP_WINDOW_MS,
  );
  if (attempts.length >= AUTH_TOKEN_LOOKUP_MAX_ATTEMPTS) {
    attemptsByClient.set(key, attempts);
    return false;
  }

  if (
    attemptsByClient.size >= AUTH_TOKEN_LOOKUP_MAX_IDENTIFIERS &&
    !attemptsByClient.has(key)
  ) {
    const oldestKey = attemptsByClient.keys().next().value;
    if (oldestKey) attemptsByClient.delete(oldestKey);
  }
  attempts.push(now);
  attemptsByClient.set(key, attempts);
  return true;
}

export function resetAuthTokenLookupRateLimitForTests() {
  attemptsByClient.clear();
}
