export function stripeSubscriptionCanStillCharge(status: string) {
  return status !== "canceled" && status !== "incomplete_expired";
}
