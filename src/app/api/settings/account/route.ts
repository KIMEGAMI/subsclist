import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type Stripe from "stripe";
import { getVerifiedApiUser } from "@/lib/api-auth";
import {
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  STRIPE_CHECKOUT_LOCK_TTL_MS,
  STRIPE_ACCOUNT_DELETION_SUBSCRIPTION_PAGE_LIMIT,
} from "@/lib/app-constants";
import { clearSession } from "@/lib/auth";
import { isProtectedAccountEmail } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";
import { stripe } from "@/lib/stripe";
import { stripeSubscriptionCanStillCharge } from "@/lib/stripe-account-deletion";

const schema = z.object({
  currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  confirmText: z.literal("削除する"),
  email: z.string().email().max(MAX_EMAIL_LENGTH),
});

function isMissingStripeResource(error: unknown) {
  const stripeError = error as {
    code?: string;
    param?: string;
    raw?: { param?: string };
  };
  return (
    stripeError.code === "resource_missing" ||
    stripeError.param === "customer" ||
    stripeError.raw?.param === "customer"
  );
}

async function hasChargeableStripeSubscription(
  customerId: string | null,
  subscriptionId: string | null,
) {
  if (!customerId && !subscriptionId) return false;

  const client = stripe();
  if (customerId) {
    try {
      let startingAfter: string | undefined;
      const seenCursors = new Set<string>();
      while (true) {
        const subscriptions = await client.subscriptions.list({
          customer: customerId,
          status: "all",
          limit: STRIPE_ACCOUNT_DELETION_SUBSCRIPTION_PAGE_LIMIT,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        });
        if (
          subscriptions.data.some((subscription) =>
            stripeSubscriptionCanStillCharge(subscription.status),
          )
        ) {
          return true;
        }
        if (!subscriptions.has_more) break;
        const nextCursor = subscriptions.data.at(-1)?.id;
        if (!nextCursor || seenCursors.has(nextCursor)) {
          throw new Error("Stripe subscription pagination was inconsistent.");
        }
        seenCursors.add(nextCursor);
        startingAfter = nextCursor;
      }
    } catch (error) {
      if (!isMissingStripeResource(error)) throw error;
    }
  }

  if (!subscriptionId) return false;
  try {
    const subscription = await client.subscriptions.retrieve(subscriptionId);
    return stripeSubscriptionCanStillCharge(subscription.status);
  } catch (error) {
    if (!isMissingStripeResource(error)) throw error;
    return false;
  }
}

async function expireStoredCheckoutSession(
  user: {
    id: string;
    stripeCustomerId: string | null;
    stripeCheckoutSessionId: string | null;
  },
) {
  if (!user.stripeCheckoutSessionId) return "none" as const;
  const client = stripe();
  let session: Stripe.Checkout.Session;
  try {
    session = await client.checkout.sessions.retrieve(user.stripeCheckoutSessionId);
  } catch (error) {
    const stripeError = error as { code?: string };
    if (stripeError.code === "resource_missing") return "none" as const;
    throw error;
  }

  const customerId = typeof session.customer === "string"
    ? session.customer
    : session.customer?.id;
  if (
    session.metadata?.userId !== user.id ||
    !user.stripeCustomerId ||
    customerId !== user.stripeCustomerId
  ) {
    throw new Error("Stored Stripe Checkout session ownership check failed.");
  }
  if (session.status === "complete") return "complete" as const;
  if (session.status === "expired") return "expired" as const;
  if (session.status !== "open") {
    throw new Error("Stored Stripe Checkout session has an unknown status.");
  }

  await client.checkout.sessions.expire(session.id);
  const expiredSession = await client.checkout.sessions.retrieve(session.id);
  if (expiredSession.status !== "expired") {
    throw new Error("Stripe Checkout session could not be confirmed expired.");
  }
  return "expired" as const;
}

export async function DELETE(request: Request) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const sessionUser = access.user;
  const parsed = schema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "アカウント削除の確認情報が正しくありません。" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripeCheckoutSessionId: true,
    },
  });
  if (!user) {
    return NextResponse.json(
      { message: "ユーザーが見つかりませんでした。" },
      { status: 404 },
    );
  }

  if (user.email !== parsed.data.email) {
    return NextResponse.json(
      { message: "削除対象のアカウントが一致しません。" },
      { status: 400 },
    );
  }

  if (isProtectedAccountEmail(user.email)) {
    return NextResponse.json(
      { message: "このアカウントは削除できません。" },
      { status: 403 },
    );
  }

  const valid = await bcrypt.compare(
    parsed.data.currentPassword,
    user.passwordHash,
  );
  if (!valid) {
    return NextResponse.json(
      { message: "現在のパスワードが正しくありません。" },
      { status: 400 },
    );
  }

  const deletionLockToken = randomUUID();
  const lockAcquiredAt = new Date();
  const lock = await prisma.user.updateMany({
    where: {
      id: user.id,
      stripeCheckoutSessionId: user.stripeCheckoutSessionId,
      OR: [
        { stripeCheckoutLockUntil: null },
        { stripeCheckoutLockUntil: { lt: lockAcquiredAt } },
      ],
    },
    data: {
      stripeCheckoutLockToken: deletionLockToken,
      stripeCheckoutLockUntil: new Date(lockAcquiredAt.getTime() + STRIPE_CHECKOUT_LOCK_TTL_MS),
    },
  });
  if (lock.count !== 1) {
    return NextResponse.json(
      { message: "決済申込みの処理中です。完了または失効を確認してから、もう一度お試しください。" },
      { status: 409 },
    );
  }

  try {
    let checkoutState: "none" | "expired" | "complete";
    let chargeableSubscription: boolean;
    try {
      checkoutState = await expireStoredCheckoutSession(user);
      if (checkoutState === "complete") {
        return NextResponse.json(
          { message: "決済済みの申込みを確認しました。契約状態が反映されてから、アカウント削除を行ってください。" },
          { status: 409 },
        );
      }
      chargeableSubscription = await hasChargeableStripeSubscription(
        user.stripeCustomerId,
        user.stripeSubscriptionId,
      );
    } catch {
      console.error("Stripe Checkout or subscription status check failed during account deletion.");
      return NextResponse.json(
        {
          message:
            "Stripeの契約状態を確認できなかったため、アカウントは削除していません。時間をおいて、もう一度お試しください。",
        },
        { status: 502 },
      );
    }
    if (chargeableSubscription) {
      return NextResponse.json(
        {
          message:
            "継続中のPremium契約があります。契約管理で解約を完了してから、アカウントを削除してください。",
        },
        { status: 409 },
      );
    }

    await prisma.$transaction(async (transaction) => {
      const heldLock = await transaction.user.findFirst({
        where: { id: user.id, stripeCheckoutLockToken: deletionLockToken },
        select: { id: true },
      });
      if (!heldLock) throw new Error("Account deletion checkout lock was lost.");
      await transaction.savingChallenge.deleteMany({ where: { userId: user.id } });
      await transaction.userNotificationDelivery.deleteMany({ where: { userId: user.id } });
      await transaction.notificationDelivery.deleteMany({ where: { userId: user.id } });
      await transaction.notificationSetting.deleteMany({ where: { userId: user.id } });
      await transaction.paymentHistory.deleteMany({ where: { userId: user.id } });
      await transaction.cancellationChecklistItem.deleteMany({ where: { userId: user.id } });
      await transaction.cancellationEvidence.deleteMany({ where: { userId: user.id } });
      await transaction.subscriptionUsage.deleteMany({ where: { userId: user.id } });
      await transaction.subscriptionPriceHistory.deleteMany({ where: { userId: user.id } });
      await transaction.subscription.deleteMany({ where: { userId: user.id } });
      await transaction.paymentMethod.deleteMany({ where: { userId: user.id } });
      await transaction.category.deleteMany({ where: { userId: user.id } });
      await transaction.userPreference.deleteMany({ where: { userId: user.id } });
      await transaction.emailVerificationToken.deleteMany({ where: { userId: user.id } });
      await transaction.emailChangeToken.deleteMany({ where: { userId: user.id } });
      await transaction.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await transaction.user.delete({ where: { id: user.id } });
    });
  } catch {
    console.error("Account deletion transaction failed.");
    return NextResponse.json(
      { message: "アカウント削除を完了できませんでした。時間をおいて、もう一度お試しください。" },
      { status: 500 },
    );
  } finally {
    try {
      await prisma.user.updateMany({
        where: { id: user.id, stripeCheckoutLockToken: deletionLockToken },
        data: { stripeCheckoutLockToken: null, stripeCheckoutLockUntil: null },
      });
    } catch {
      console.error("Account deletion checkout lock cleanup failed.");
    }
  }

  try {
    await clearSession();
  } catch {
    console.error("Deleted account session cookie cleanup failed.");
  }
  return NextResponse.json({ ok: true });
}
