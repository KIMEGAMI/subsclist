import { NextRequest, NextResponse } from "next/server";
import { hashToken, setSession } from "@/lib/auth";
import { isProtectedAccountEmail } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { syncStripeCustomerProfile } from "@/lib/stripe-customer-profile";

function hasUniqueConstraintCode(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002",
  );
}

function redirectToSettings(
  request: NextRequest,
  status: "success" | "success-stripe-pending" | "invalid" | "conflict" | "error",
) {
  return NextResponse.redirect(
    new URL(`/settings?email-change=${status}`, request.url),
  );
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return redirectToSettings(request, "invalid");

  try {
    const now = new Date();
    const result = await prisma.$transaction(async (transaction) => {
      const record = await transaction.emailChangeToken.findUnique({
        where: { tokenHash: hashToken(token) },
        select: {
          id: true,
          userId: true,
          newEmail: true,
          usedAt: true,
          expiresAt: true,
        },
      });
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
