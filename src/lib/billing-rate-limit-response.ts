import { NextResponse } from "next/server";
import { claimBillingOperation } from "@/lib/billing-rate-limit";

export function billingRateLimitResponse(userId: string, operation: string) {
  const result = claimBillingOperation(`${operation}:${userId}`);
  if (!result.limited) return null;

  return NextResponse.json(
    {
      message:
        "課金操作が短時間に繰り返されました。少し待ってから、もう一度お試しください。",
    },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSeconds) },
    },
  );
}
