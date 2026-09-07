import {
  GEMINI_DAILY_REQUEST_LIMIT,
  GEMINI_HOURLY_REQUEST_LIMIT,
} from "./app-constants.ts";

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

export type GeminiRateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAt: Date };

export function evaluateGeminiRateLimit(
  requestTimes: Date[],
  now = new Date(),
): GeminiRateLimitDecision {
  const hourStart = now.getTime() - HOUR_MS;
  const dayStart = now.getTime() - DAY_MS;
  const inDay = requestTimes
    .filter((createdAt) => createdAt.getTime() > dayStart)
    .sort((a, b) => a.getTime() - b.getTime());
  const inHour = inDay.filter((createdAt) => createdAt.getTime() > hourStart);

  if (inHour.length >= GEMINI_HOURLY_REQUEST_LIMIT) {
    return { allowed: false, retryAt: new Date(inHour[0].getTime() + HOUR_MS) };
  }
  if (inDay.length >= GEMINI_DAILY_REQUEST_LIMIT) {
    return { allowed: false, retryAt: new Date(inDay[0].getTime() + DAY_MS) };
  }
  return { allowed: true };
}
