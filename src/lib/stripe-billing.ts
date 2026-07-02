import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export type StripeCheckoutSyncStatus = "synced" | "not_complete" | "invalid_user" | "missing_subscription";

export function activePlan(status: string | null | undefined) {
  return status === "active" || status === "trialing" ? "PREMIUM" : "FREE";
}

export async function syncStripeSubscription(subscription: Stripe.Subscription) {
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

export async function syncStripeCheckoutSession(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (session.metadata?.plan === "LIFETIME") {
    if (!userId || !customerId || session.mode !== "payment" || session.payment_status !== "paid") return false;
    await prisma.user.update({
      where: { id: userId },
      data: {
        plan: "LIFETIME",
        stripeCustomerId: customerId,
        stripeSubscriptionId: null,
      },
    });
    return true;
  }

  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!userId || !customerId || !subscriptionId) return false;

  await prisma.user.update({
    where: { id: userId },
    data: {
      plan: "PREMIUM",
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
    },
  });
  return true;
}

export async function syncStripeCheckoutSessionById(sessionId: string, userId: string): Promise<StripeCheckoutSyncStatus> {
  const session = await stripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });

  if (session.metadata?.userId !== userId) return "invalid_user";
  if (session.metadata?.plan === "LIFETIME") {
    if (session.mode !== "payment" || session.status !== "complete" || session.payment_status !== "paid") return "not_complete";
    const synced = await syncStripeCheckoutSession(session);
    return synced ? "synced" : "missing_subscription";
  }
  if (session.mode !== "subscription" || session.status !== "complete") return "not_complete";

  const synced = await syncStripeCheckoutSession(session);
  return synced ? "synced" : "missing_subscription";
}

export async function syncLatestStripeSubscriptionForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, stripeCustomerId: true, stripeSubscriptionId: true },
  });
  if (user?.plan === "LIFETIME") return "lifetime" as const;
  if (!user?.stripeCustomerId && !user?.stripeSubscriptionId) return "not_found" as const;

  const client = stripe();
  if (user.stripeSubscriptionId) {
    const subscription = await client.subscriptions.retrieve(user.stripeSubscriptionId).catch(async (error) => {
      const stripeError = error as { code?: string };
      if (stripeError.code !== "resource_missing") throw error;
      await prisma.user.update({
        where: { id: userId },
        data: { stripeSubscriptionId: null },
      });
      return null;
    });
    if (!subscription) return "stale_subscription" as const;
    await syncStripeSubscription(subscription);
    return activePlan(subscription.status) === "PREMIUM" ? "premium" as const : "free" as const;
  }

  const subscriptions = await client.subscriptions.list({ customer: user.stripeCustomerId ?? undefined, status: "all", limit: 10 }).catch(async (error) => {
    const stripeError = error as { code?: string; param?: string; raw?: { param?: string } };
    if (stripeError.code !== "resource_missing" && stripeError.param !== "customer" && stripeError.raw?.param !== "customer") throw error;
    await prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: null, stripeSubscriptionId: null },
    });
    return null;
  });
  if (!subscriptions) return "stale_customer" as const;
  const active = subscriptions.data.find((item) => item.status === "active" || item.status === "trialing") ?? subscriptions.data[0];
  if (!active) return "not_found" as const;
  await syncStripeSubscription(active);
  return activePlan(active.status) === "PREMIUM" ? "premium" as const : "free" as const;
}
