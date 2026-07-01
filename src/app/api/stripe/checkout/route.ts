import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

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
    return NextResponse.json({ message: "Stripe Checkout の作成に失敗しました。Stripe設定を確認してください。" }, { status: 500 });
  }
}
