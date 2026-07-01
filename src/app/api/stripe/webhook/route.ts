import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { stripeForWebhook } from "@/lib/stripe";

export const runtime = "nodejs";

function activePlan(status: string | null | undefined) {
  return status === "active" || status === "trialing" ? "PREMIUM" : "FREE";
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const userId = subscription.metadata?.userId;
  const data = {
    plan: activePlan(subscription.status) as "FREE" | "PREMIUM",
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
  };

  if (userId) {
    await prisma.user.update({ where: { id: userId }, data });
    return;
  }

  await prisma.user.updateMany({ where: { stripeCustomerId: customerId }, data });
}

async function syncCheckoutSession(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!userId || !customerId || !subscriptionId) return;

  await prisma.user.update({
    where: { id: userId },
    data: {
      plan: "PREMIUM",
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
    },
  });
}

export async function POST(request: Request) {
  const signature = (await headers()).get("stripe-signature");
  if (!signature) return NextResponse.json({ message: "Stripe署名がありません。" }, { status: 400 });

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripeForWebhook().webhooks.constructEvent(body, signature, env.stripeWebhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed.", error);
    return NextResponse.json({ message: "Stripe署名の検証に失敗しました。" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      await syncCheckoutSession(event.data.object as Stripe.Checkout.Session);
    }
    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      await syncSubscription(event.data.object as Stripe.Subscription);
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook handling failed.", error);
    return NextResponse.json({ message: "Stripe Webhook の処理に失敗しました。" }, { status: 500 });
  }
}
