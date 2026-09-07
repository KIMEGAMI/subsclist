import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { stripeForWebhook } from "@/lib/stripe";
import { syncStripeCheckoutSession, syncStripeInvoiceSubscription, syncStripeSubscription } from "@/lib/stripe-billing";
import {
  canUseDeletedSubscriptionPayload,
  isStripeSubscriptionEvent,
} from "@/lib/stripe-webhook";

export const runtime = "nodejs";

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function claimWebhookEvent(event: Stripe.Event) {
  try {
    await prisma.stripeWebhookEvent.create({
      data: { id: event.id, type: event.type },
    });
    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) return false;
    throw error;
  }
}

async function currentStripeSubscription(
  client: Stripe,
  payload: Stripe.Subscription,
) {
  try {
    return await client.subscriptions.retrieve(payload.id);
  } catch (error) {
    const stripeError = error as { code?: string };
    if (canUseDeletedSubscriptionPayload(payload.status, stripeError.code)) {
      return payload;
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const signature = (await headers()).get("stripe-signature");
  if (!signature) return NextResponse.json({ message: "Stripe署名がありません。" }, { status: 400 });

  const body = await request.text();
  let client: Stripe;
  try {
    client = stripeForWebhook();
  } catch {
    console.error("Stripe webhook configuration is invalid.");
    return NextResponse.json(
      { message: "Stripe Webhookの設定が正しくありません。" },
      { status: 500 },
    );
  }

  let event: Stripe.Event;
  try {
    event = client.webhooks.constructEvent(
      body,
      signature,
      env.stripeWebhookSecret,
    );
  } catch {
    console.error("Stripe webhook signature verification failed.");
    return NextResponse.json({ message: "Stripe署名の検証に失敗しました。" }, { status: 400 });
  }

  let claimed = false;
  try {
    claimed = await claimWebhookEvent(event);
    if (!claimed) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (event.type === "checkout.session.completed") {
      await syncStripeCheckoutSession(event.data.object as Stripe.Checkout.Session);
    }
    if (isStripeSubscriptionEvent(event.type)) {
      const subscription = await currentStripeSubscription(
        client,
        event.data.object as Stripe.Subscription,
      );
      await syncStripeSubscription(subscription);
    }
    if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      await syncStripeInvoiceSubscription(event.data.object as Stripe.Invoice);
    }
    await prisma.stripeWebhookEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date() },
    });
    return NextResponse.json({ received: true });
  } catch {
    if (claimed) {
      await prisma.stripeWebhookEvent.deleteMany({ where: { id: event.id } });
    }
    console.error("Stripe webhook handling failed.");
    return NextResponse.json({ message: "Stripe Webhookの処理に失敗しました。" }, { status: 500 });
  }
}
