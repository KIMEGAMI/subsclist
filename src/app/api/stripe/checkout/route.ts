import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

function checkoutErrorMessage(error: unknown) {
  const stripeError = error as { type?: string; code?: string };
  if (stripeError.type === "StripeAuthenticationError") {
    return "Stripeのシークレットキーが正しくありません。STRIPE_SECRET_KEYにStripeダッシュボードのテスト用シークレットキー（sk_test_...）を設定してください。";
  }
  if (stripeError.code === "resource_missing") {
    return "Stripeの価格IDが見つかりません。STRIPE_PREMIUM_PRICE_IDが、現在のStripeキーと同じテスト/本番モードのprice_...になっているか確認してください。";
  }
  if (stripeError.type === "StripeInvalidRequestError") {
    return "Stripe Checkoutの作成条件が正しくありません。Priceが月額サブスクリプションとして有効になっているか確認してください。";
  }
  return "Stripe Checkoutの作成に失敗しました。Stripe設定を確認してください。";
}

export async function POST() {
  const user = await requireVerifiedUser();
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return NextResponse.json({ message: "ユーザーが見つかりません。" }, { status: 404 });

  try {
    const client = stripe();
    let customerId = dbUser.stripeCustomerId;

    if (!customerId) {
      const customer = await client.customers.create({
        email: dbUser.email,
        name: dbUser.name ?? undefined,
        metadata: { userId: dbUser.id },
      });
      customerId = customer.id;
      await prisma.user.update({ where: { id: dbUser.id }, data: { stripeCustomerId: customerId } });
    }

    const session = await client.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: env.stripePremiumPriceId, quantity: 1 }],
      success_url: `${env.appUrl}/settings?checkout=success`,
      cancel_url: `${env.appUrl}/settings?checkout=cancelled`,
      allow_promotion_codes: true,
      metadata: { userId: dbUser.id },
      subscription_data: { metadata: { userId: dbUser.id } },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout creation failed.", error);
    return NextResponse.json({ message: checkoutErrorMessage(error) }, { status: 500 });
  }
}
