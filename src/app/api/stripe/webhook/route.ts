import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  MAX_STRIPE_WEBHOOK_BODY_BYTES,
  STRIPE_WEBHOOK_PROCESSING_LEASE_MS,
  STRIPE_WEBHOOK_RETRY_AFTER_SECONDS,
} from "@/lib/app-constants";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { readTextBodyWithLimit } from "@/lib/request-body";
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
  const now = new Date();
  try {
    await prisma.stripeWebhookEvent.create({
      data: { id: event.id, type: event.type, processingStartedAt: now },
    });
    return { status: "claimed" as const, processingStartedAt: now };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
  }

  const existing = await prisma.stripeWebhookEvent.findUnique({
    where: { id: event.id },
    select: { processingStartedAt: true, processedAt: true },
  });
  if (existing?.processedAt) return { status: "processed" as const };
  if (!existing) return { status: "in_progress" as const };

  const leaseExpiredBefore = new Date(now.getTime() - STRIPE_WEBHOOK_PROCESSING_LEASE_MS);
  if (existing.processingStartedAt > leaseExpiredBefore)
    return { status: "in_progress" as const };

  const reclaimed = await prisma.stripeWebhookEvent.updateMany({
    where: {
      id: event.id,
      processedAt: null,
      processingStartedAt: existing.processingStartedAt,
    },
    data: { processingStartedAt: now },
  });
  return reclaimed.count === 1
    ? { status: "claimed" as const, processingStartedAt: now }
    : { status: "in_progress" as const };
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

  const body = await readTextBodyWithLimit(request, MAX_STRIPE_WEBHOOK_BODY_BYTES);
  if (!body.ok && body.reason === "too_large") {
    return NextResponse.json({ message: "Stripe Webhookの本文が大きすぎます。" }, { status: 413 });
  }
  if (!body.ok) {
    return NextResponse.json({ message: "Stripe Webhookの本文を読み取れません。" }, { status: 400 });
  }
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
      body.value,
      signature,
      env.stripeWebhookSecret,
    );
  } catch {
    console.error("Stripe webhook signature verification failed.");
    return NextResponse.json({ message: "Stripe署名の検証に失敗しました。" }, { status: 400 });
  }

  let processingStartedAt: Date | null = null;
  try {
    const claim = await claimWebhookEvent(event);
    if (claim.status === "processed") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (claim.status === "in_progress") {
      return NextResponse.json(
        { message: "Stripe Webhookを処理中です。時間をおいて再送してください。" },
        { status: 503, headers: { "Retry-After": String(STRIPE_WEBHOOK_RETRY_AFTER_SECONDS) } },
      );
    }
    processingStartedAt = claim.processingStartedAt;
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
    const completed = await prisma.stripeWebhookEvent.updateMany({
      where: {
        id: event.id,
        processingStartedAt,
        processedAt: null,
      },
      data: { processedAt: new Date() },
    });
    if (completed.count !== 1) throw new Error("Stripe webhook lease was lost.");
    return NextResponse.json({ received: true });
  } catch {
    if (processingStartedAt) {
      await prisma.stripeWebhookEvent.deleteMany({
        where: { id: event.id, processingStartedAt, processedAt: null },
      });
    }
    console.error("Stripe webhook handling failed.");
    return NextResponse.json({ message: "Stripe Webhookの処理に失敗しました。" }, { status: 500 });
  }
}
