const subscriptionEventTypes = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export function isStripeSubscriptionEvent(type: string) {
  return subscriptionEventTypes.has(type);
}

export function canUseDeletedSubscriptionPayload(
  status: string,
  errorCode: string | null | undefined,
) {
  return status === "canceled" && errorCode === "resource_missing";
}
