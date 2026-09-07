import type Stripe from "stripe";
import {
  STRIPE_SUBSCRIPTION_STATUS_ALL,
  STRIPE_TRIAL_LOOKBACK_SUBSCRIPTION_LIMIT,
} from "@/lib/app-constants";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import {
  activePlan,
  canApplyStripeSubscription,
  stripeBillingSyncOutcome,
} from "@/lib/stripe-entitlement";
import { hasStripeTrial, stripeTimestampToDate } from "@/lib/stripe-trial";

import { stripeSubscriptionPeriodData } from "@/lib/stripe-subscription-period";
export { activePlan, hasPremiumStripeStatus } from "@/lib/stripe-entitlement";

export type StripeCheckoutSyncStatus =
  "synced" | "not_complete" | "invalid_user" | "missing_subscription";

function stripeSubscriptionSyncData(
  subscription: Stripe.Subscription,
  customerId: string,
) {
  return {
    plan: activePlan(subscription.status) as "FREE" | "PREMIUM",
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionStatus: subscription.status,
    stripeTrialStartAt: stripeTimestampToDate(subscription.trial_start),
    stripeTrialEndAt: stripeTimestampToDate(subscription.trial_end),
    ...stripeSubscriptionPeriodData(subscription),
  };
}

async function markTrialUsedByUserId(userId: string) {
  await prisma.user.updateMany({
    where: { id: userId, trialUsedAt: null },
    data: { trialUsedAt: new Date() },
  });
}

async function markTrialUsedByCustomerId(customerId: string) {
  await prisma.user.updateMany({
    where: { stripeCustomerId: customerId, trialUsedAt: null },
    data: { trialUsedAt: new Date() },
  });
}

export async function syncStripeSubscription(
  subscription: Stripe.Subscription,
) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const userId = subscription.metadata?.userId;
  const data = stripeSubscriptionSyncData(subscription, customerId);

  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          stripeSubscriptionStatus: true,
        },
      })
    : await prisma.user.findFirst({
        where: {
          OR: [
            { stripeCustomerId: customerId },
            { stripeSubscriptionId: subscription.id },
          ],
        },
        select: {
          id: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          stripeSubscriptionStatus: true,
        },
      });

  if (
    !user ||
    !canApplyStripeSubscription(
      {
        customerId: user.stripeCustomerId,
        subscriptionId: user.stripeSubscriptionId,
        status: user.stripeSubscriptionStatus,
      },
      {
        customerId,
        subscriptionId: subscription.id,
        status: subscription.status,
      },
    )
  ) {
    return false;
  }

  const updated = await prisma.user.updateMany({
    where: {
      id: user.id,
      stripeCustomerId: user.stripeCustomerId,
      stripeSubscriptionId: user.stripeSubscriptionId,
      stripeSubscriptionStatus: user.stripeSubscriptionStatus,
    },
    data,
  });
  if (updated.count !== 1) return false;

  if (hasStripeTrial(subscription)) {
    if (userId) await markTrialUsedByUserId(user.id);
    else await markTrialUsedByCustomerId(customerId);
  }
  return true;
}

type StripeInvoiceWithSubscription = Stripe.Invoice & {
  subscription?: string | Stripe.Subscription | null;
};

export async function syncStripeInvoiceSubscription(invoice: Stripe.Invoice) {
  const subscriptionValue = (invoice as StripeInvoiceWithSubscription)
    .subscription;
  if (!subscriptionValue) return false;

  const subscription =
    typeof subscriptionValue === "string"
      ? await stripe().subscriptions.retrieve(subscriptionValue)
      : subscriptionValue;
  await syncStripeSubscription(subscription);
  return true;
}

export async function syncStripeCheckoutSession(
  session: Stripe.Checkout.Session,
) {
  const userId = session.metadata?.userId;
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
  if (session.metadata?.plan === "LIFETIME") {
    if (
      !userId ||
      !customerId ||
      session.mode !== "payment" ||
      session.payment_status !== "paid"
    )
      return false;
    await prisma.user.update({
      where: { id: userId },
      data: {
        plan: "PREMIUM",
        stripeCustomerId: customerId,
        stripeSubscriptionId: null,
        stripeSubscriptionStatus: null,
        stripeTrialStartAt: null,
        stripeTrialEndAt: null,
        stripeCurrentPeriodEnd: null,
        stripeCancelAt: null,
        stripeCancelAtPeriodEnd: false,
      },
    });
    return true;
  }

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
  if (!userId || !customerId || !subscriptionId) return false;
  const subscription =
    typeof session.subscription === "string"
      ? await stripe().subscriptions.retrieve(subscriptionId)
      : session.subscription;
  if (!subscription) return false;
  const subscriptionCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  if (subscriptionCustomerId !== customerId) return false;
  if (subscription.metadata?.userId && subscription.metadata.userId !== userId)
    return false;

  return syncStripeSubscription(subscription);
}

export async function syncStripeCheckoutSessionById(
  sessionId: string,
  userId: string,
): Promise<StripeCheckoutSyncStatus> {
  const session = await stripe().checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });

  if (session.metadata?.userId !== userId) return "invalid_user";
  if (session.metadata?.plan === "LIFETIME") {
    if (
      session.mode !== "payment" ||
      session.status !== "complete" ||
      session.payment_status !== "paid"
    )
      return "not_complete";
    const synced = await syncStripeCheckoutSession(session);
    return synced ? "synced" : "missing_subscription";
  }
  if (session.mode !== "subscription" || session.status !== "complete")
    return "not_complete";

  const synced = await syncStripeCheckoutSession(session);
  return synced ? "synced" : "missing_subscription";
}

export async function syncLatestStripeSubscriptionForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, stripeCustomerId: true, stripeSubscriptionId: true },
  });
  if (user?.plan === "LIFETIME") {
    await prisma.user.update({
      where: { id: userId },
      data: { plan: "PREMIUM" },
    });
    return "premium" as const;
  }
  if (!user?.stripeCustomerId && !user?.stripeSubscriptionId)
    return "not_found" as const;

  const client = stripe();
  if (user.stripeSubscriptionId) {
    const subscription = await client.subscriptions
      .retrieve(user.stripeSubscriptionId)
      .catch(async (error) => {
        const stripeError = error as { code?: string };
        if (stripeError.code !== "resource_missing") throw error;
        await prisma.user.update({
          where: { id: userId },
          data: {
            stripeSubscriptionId: null,
            stripeSubscriptionStatus: null,
            stripeTrialStartAt: null,
            stripeTrialEndAt: null,
            stripeCurrentPeriodEnd: null,
            stripeCancelAt: null,
            stripeCancelAtPeriodEnd: false,
          },
        });
        return null;
      });
    if (subscription) {
      const synced = await syncStripeSubscription(subscription);
      if (!synced) return "not_found" as const;
      return stripeBillingSyncOutcome(subscription.status);
    }
    if (!user.stripeCustomerId) {
      await prisma.user.update({
        where: { id: userId },
        data: { plan: "FREE" },
      });
      return "stale_subscription" as const;
    }
  }

  const subscriptions = await client.subscriptions
    .list({
      customer: user.stripeCustomerId ?? undefined,
      status: STRIPE_SUBSCRIPTION_STATUS_ALL,
      limit: STRIPE_TRIAL_LOOKBACK_SUBSCRIPTION_LIMIT,
    })
    .catch(async (error) => {
      const stripeError = error as {
        code?: string;
        param?: string;
        raw?: { param?: string };
      };
      if (
        stripeError.code !== "resource_missing" &&
        stripeError.param !== "customer" &&
        stripeError.raw?.param !== "customer"
      )
        throw error;
      await prisma.user.update({
        where: { id: userId },
        data: {
          plan: "FREE",
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          stripeSubscriptionStatus: null,
          stripeTrialStartAt: null,
          stripeTrialEndAt: null,
          stripeCurrentPeriodEnd: null,
          stripeCancelAt: null,
          stripeCancelAtPeriodEnd: false,
        },
      });
      return null;
    });
  if (!subscriptions) return "stale_customer" as const;
  if (subscriptions.data.some(hasStripeTrial))
    await markTrialUsedByUserId(userId);
  const active =
    subscriptions.data.find((item) => activePlan(item.status) === "PREMIUM") ??
    subscriptions.data[0];
  if (!active) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        plan: "FREE",
        stripeSubscriptionId: null,
        stripeSubscriptionStatus: null,
        stripeTrialStartAt: null,
        stripeTrialEndAt: null,
        stripeCurrentPeriodEnd: null,
        stripeCancelAt: null,
        stripeCancelAtPeriodEnd: false,
      },
    });
    return "not_found" as const;
  }
  const synced = await syncStripeSubscription(active);
  if (!synced) return "not_found" as const;
  return stripeBillingSyncOutcome(active.status);
}
