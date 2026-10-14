import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findTokenRecord, setSession } from "@/lib/auth";
import { MAX_AUTH_REQUEST_BODY_BYTES, ONE_TIME_TOKEN_MAX_LENGTH } from "@/lib/app-constants";
import { env, isProtectedAccountEmail } from "@/lib/env";
import { authTokenLookupKey, claimAuthTokenLookup } from "@/lib/auth-token-rate-limit";
import { prisma } from "@/lib/prisma";
import { readTextBodyWithLimit } from "@/lib/request-body";
import { requestClientIdentifier } from "@/lib/request-client";
import { stripe } from "@/lib/stripe";
import { syncStripeCustomerProfile } from "@/lib/stripe-customer-profile";

const schema = z.object({
  token: z.string().min(20).max(ONE_TIME_TOKEN_MAX_LENGTH).regex(/^[A-Za-z0-9_-]+$/),
});

function hasUniqueConstraintCode(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002",
  );
}

function redirectToSettings(
  request: Request,
  status: "success" | "success-stripe-pending" | "invalid" | "conflict" | "error",
) {
  const response = NextResponse.redirect(
    new URL(`/settings?email-change=${status}`, request.url),
    303,
  );
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token || !schema.safeParse({ token }).success)
    return redirectToSettings(request, "invalid");

  const confirmationUrl = new URL("/verify-email-change", request.url);
  confirmationUrl.searchParams.set("token", token);
  const response = NextResponse.redirect(confirmationUrl);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function POST(request: Request) {
  const body = await readTextBodyWithLimit(request, MAX_AUTH_REQUEST_BODY_BYTES);
  if (!body.ok) {
    return redirectToSettings(request, "invalid");
  }

  let value: unknown;
  const contentType = request.headers.get("content-type")?.split(";")[0].trim();
  if (contentType === "application/x-www-form-urlencoded") {
    const parameters = new URLSearchParams(body.value);
    const tokens = parameters.getAll("token");
    value = tokens.length === 1 ? { token: tokens[0] } : {};
  } else if (contentType === "application/json") {
    try {
      value = JSON.parse(body.value);
    } catch {
      value = {};
    }
  } else {
    value = {};
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    return redirectToSettings(request, "invalid");

  const lookupKey = authTokenLookupKey(requestClientIdentifier(request), env.authSecret);

  try {
    const now = new Date();
    const result = await prisma.$transaction(async (transaction) => {
      const record = await findTokenRecord(parsed.data.token, (tokenHash) =>
        transaction.emailChangeToken.findUnique({
          where: { tokenHash },
          select: {
            id: true,
            userId: true,
            newEmail: true,
            usedAt: true,
            expiresAt: true,
          },
        }),
        () => claimAuthTokenLookup(lookupKey),
      );
      if (!record || record.usedAt || record.expiresAt <= now)
        return { status: "invalid" as const };
      if (isProtectedAccountEmail(record.newEmail))
        return { status: "invalid" as const };

      const existingUser = await transaction.user.findUnique({
        where: { email: record.newEmail },
        select: { id: true },
      });
      if (existingUser && existingUser.id !== record.userId)
        return { status: "conflict" as const };

      const claimed = await transaction.emailChangeToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return { status: "invalid" as const };

      await transaction.user.update({
        where: { id: record.userId },
        data: {
          email: record.newEmail,
          emailVerified: now,
          sessionVersion: { increment: 1 },
        },
      });
      await transaction.emailChangeToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: now },
      });
      const user = await transaction.user.findUnique({
        where: { id: record.userId },
        select: {
          id: true,
          email: true,
          name: true,
          stripeCustomerId: true,
        },
      });
      return { status: "success" as const, user };
    });
    if (result.status !== "success")
      return redirectToSettings(request, result.status);

    if (!result.user) return redirectToSettings(request, "error");
    await setSession(result.user.id, true);
    if (result.user.stripeCustomerId) {
      try {
        const synced = await syncStripeCustomerProfile(
          stripe(),
          result.user.stripeCustomerId,
          result.user,
        );
        if (!synced)
          return redirectToSettings(request, "success-stripe-pending");
      } catch {
        console.error("Stripe customer email synchronization failed.");
        return redirectToSettings(request, "success-stripe-pending");
      }
    }
    return redirectToSettings(request, "success");
  } catch (error) {
    if (hasUniqueConstraintCode(error))
      return redirectToSettings(request, "conflict");
    console.error("Failed to verify email address change.");
    return redirectToSettings(request, "error");
  }
}
