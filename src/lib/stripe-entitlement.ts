import { STRIPE_ACTIVE_SUBSCRIPTION_STATUSES } from "./app-constants.ts";

const STRIPE_MANAGEABLE_SUBSCRIPTION_STATUSES = new Set([
  "active", "trialing", "past_due", "unpaid", "incomplete", "paused",
]);

const STRIPE_ATTENTION_SUBSCRIPTION_STATUSES = new Set([
  "past_due", "unpaid", "incomplete", "paused",
]);

export function activePlan(status: string | null | undefined) {
  return STRIPE_ACTIVE_SUBSCRIPTION_STATUSES.some(
    (activeStatus) => activeStatus === status,
  )
    ? "PREMIUM"
    : "FREE";
}

export function hasPremiumStripeStatus(status: string | null | undefined) {
  return activePlan(status) === "PREMIUM";
}

export function stripeSubscriptionCanBeManaged(
  status: string | null | undefined,
) {
  return Boolean(status && STRIPE_MANAGEABLE_SUBSCRIPTION_STATUSES.has(status));
}

export function stripeBillingSyncOutcome(
  status: string | null | undefined,
): "premium" | "attention" | "free" {
  if (status && STRIPE_ATTENTION_SUBSCRIPTION_STATUSES.has(status)) {
    return "attention";
  }
  return activePlan(status) === "PREMIUM" ? "premium" : "free";
}

export function canApplyStripeSubscription(
  current: {
    customerId: string | null;
    subscriptionId: string | null;
    status: string | null;
  },
  incoming: { customerId: string; subscriptionId: string; status: string },
) {
  if (current.customerId && current.customerId !== incoming.customerId)
    return false;
  if (
    !current.subscriptionId ||
    current.subscriptionId === incoming.subscriptionId
  )
    return true;

  return (
    !hasPremiumStripeStatus(current.status) &&
    hasPremiumStripeStatus(incoming.status)
  );
}
