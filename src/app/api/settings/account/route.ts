import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { clearSession, requireVerifiedUser } from "@/lib/auth";
import { isProtectedAccountEmail } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

const schema = z.object({
  currentPassword: z.string().min(1),
  confirmText: z.literal("削除する"),
  email: z.string().email(),
});

function isMissingStripeResource(error: unknown) {
  const stripeError = error as { code?: string; param?: string; raw?: { param?: string } };
  return stripeError.code === "resource_missing"
    || stripeError.param === "customer"
    || stripeError.raw?.param === "customer";
}

function canStillBeCharged(status: string) {
  return status !== "canceled" && status !== "incomplete_expired";
}

async function hasChargeableStripeSubscription(customerId: string | null, subscriptionId: string | null) {
  if (!customerId && !subscriptionId) return false;

  const client = stripe();
  if (customerId) {
    try {
      const subscriptions = await client.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
      return subscriptions.data.some((subscription) => canStillBeCharged(subscription.status));
    } catch (error) {
      if (!isMissingStripeResource(error)) throw error;
      return false;
    }
  }

  if (!subscriptionId) return false;
  try {
    const subscription = await client.subscriptions.retrieve(subscriptionId);
    return canStillBeCharged(subscription.status);
  } catch (error) {
    if (!isMissingStripeResource(error)) throw error;
    return false;
  }
}

export async function DELETE(request: Request) {
  const sessionUser = await requireVerifiedUser();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "アカウント削除の確認情報が正しくありません。" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });
  if (!user) {
    return NextResponse.json({ message: "ユーザーが見つかりませんでした。" }, { status: 404 });
  }

  if (user.email !== parsed.data.email) {
    return NextResponse.json({ message: "削除対象のアカウントが一致しません。" }, { status: 400 });
  }

  if (isProtectedAccountEmail(user.email)) {
    return NextResponse.json({ message: "このアカウントは削除できません。" }, { status: 403 });
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ message: "現在のパスワードが正しくありません。" }, { status: 400 });
  }

  try {
    const chargeableSubscription = await hasChargeableStripeSubscription(user.stripeCustomerId, user.stripeSubscriptionId);
    if (chargeableSubscription) {
      return NextResponse.json(
        { message: "継続中のPremium契約があります。契約管理で解約を完了してから、アカウントを削除してください。" },
        { status: 409 },
      );
    }
  } catch {
    console.error("Stripe subscription status check failed during account deletion.");
    return NextResponse.json(
      { message: "Stripeの契約状態を確認できなかったため、アカウントは削除していません。時間をおいて、もう一度お試しください。" },
      { status: 502 },
    );
  }

  await prisma.$transaction([
    prisma.savingChallenge.deleteMany({ where: { userId: user.id } }),
    prisma.userNotificationDelivery.deleteMany({ where: { userId: user.id } }),
    prisma.notificationDelivery.deleteMany({ where: { userId: user.id } }),
    prisma.notificationSetting.deleteMany({ where: { userId: user.id } }),
    prisma.paymentHistory.deleteMany({ where: { userId: user.id } }),
    prisma.cancellationChecklistItem.deleteMany({ where: { userId: user.id } }),
    prisma.cancellationEvidence.deleteMany({ where: { userId: user.id } }),
    prisma.subscriptionUsage.deleteMany({ where: { userId: user.id } }),
    prisma.subscriptionPriceHistory.deleteMany({ where: { userId: user.id } }),
    prisma.subscription.deleteMany({ where: { userId: user.id } }),
    prisma.paymentMethod.deleteMany({ where: { userId: user.id } }),
    prisma.category.deleteMany({ where: { userId: user.id } }),
    prisma.userPreference.deleteMany({ where: { userId: user.id } }),
    prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } }),
    prisma.emailChangeToken.deleteMany({ where: { userId: user.id } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    prisma.user.delete({ where: { id: user.id } }),
  ]);

  await clearSession();
  return NextResponse.json({ ok: true });
}
