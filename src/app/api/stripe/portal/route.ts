import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

function portalErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "STRIPE_SECRET_KEY is not set.") return "STRIPE_SECRET_KEYが設定されていません。Stripeのシークレットキーを.envに設定してください。";
    if (error.message === "STRIPE_PREMIUM_PRICE_ID is not set.") return "STRIPE_PREMIUM_PRICE_IDが設定されていません。Stripeの価格IDを.envに設定してください。";
  }
  const stripeError = error as { type?: string; code?: string };
  if (stripeError.type === "StripeAuthenticationError") return "Stripeのシークレットキーが正しくありません。STRIPE_SECRET_KEYを確認してください。";
  return "Stripe管理画面を開けませんでした。Stripe設定を確認してください。";
}

export async function POST() {
  const user = await requireVerifiedUser();
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return NextResponse.json({ message: "ユーザーが見つかりません。" }, { status: 404 });
  if (!dbUser.stripeCustomerId) {
    return NextResponse.json({ message: "Stripe顧客が未作成です。Premium登録後に管理できます。" }, { status: 400 });
  }

  try {
    const client = stripe();
    const customer = await client.customers.retrieve(dbUser.stripeCustomerId).catch(async (error) => {
      const stripeError = error as { code?: string; param?: string; raw?: { param?: string } };
      if (stripeError.code !== "resource_missing" && stripeError.param !== "customer" && stripeError.raw?.param !== "customer") throw error;
      await prisma.user.update({
        where: { id: dbUser.id },
        data: { stripeCustomerId: null, stripeSubscriptionId: null },
      });
      return null;
    });
    if (!customer || customer.deleted) {
      return NextResponse.json({ message: "DBに保存されていたStripe顧客IDが現在のStripeキーで見つかりませんでした。古いIDを解除しました。もう一度Premiumにアップグレードしてください。" }, { status: 409 });
    }

    const session = await client.billingPortal.sessions.create({
      customer: dbUser.stripeCustomerId,
      return_url: `${env.appUrl}/settings`,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe portal creation failed.", error);
    return NextResponse.json({ message: portalErrorMessage(error) }, { status: 500 });
  }
}
