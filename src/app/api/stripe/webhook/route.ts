import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { env } from "@/lib/env";
import { stripeForWebhook } from "@/lib/stripe";
import { syncStripeCheckoutSession, syncStripeInvoiceSubscription, syncStripeSubscription } from "@/lib/stripe-billing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = (await headers()).get("stripe-signature");
  if (!signature) return NextResponse.json({ message: "Stripe署名がありません。" }, { status: 400 });

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripeForWebhook().webhooks.constructEvent(body, signature, env.stripeWebhookSecret);
  } catch {
    console.error("Stripe webhook signature verification failed.");
    return NextResponse.json({ message: "Stripe署名の検証に失敗しました。" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      await syncStripeCheckoutSession(event.data.object as Stripe.Checkout.Session);
    }
    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      await syncStripeSubscription(event.data.object as Stripe.Subscription);
    }
    if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      await syncStripeInvoiceSubscription(event.data.object as Stripe.Invoice);
    }
    return NextResponse.json({ received: true });
  } catch {
    console.error("Stripe webhook handling failed.");
    return NextResponse.json({ message: "Stripe Webhookの処理に失敗しました。" }, { status: 500 });
  }
}
