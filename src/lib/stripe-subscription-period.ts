import { MILLISECONDS_PER_SECOND } from "./billing.ts";

type StripeSubscriptionPeriodSource = {
  cancel_at: number | null;
  cancel_at_period_end: boolean;
  items: {
    data: Array<{ current_period_end: number }>;
  };
};

function timestampDate(value: number | null | undefined) {
  if (!value || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * MILLISECONDS_PER_SECOND);
}

export function stripeSubscriptionPeriodData(
  subscription: StripeSubscriptionPeriodSource,
) {
  const periodEndTimestamp = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right)[0];
  const stripeCurrentPeriodEnd = timestampDate(periodEndTimestamp);
  const explicitCancelAt = timestampDate(subscription.cancel_at);
  const stripeCancelAt = explicitCancelAt ??
    (subscription.cancel_at_period_end ? stripeCurrentPeriodEnd : null);

  return {
    stripeCurrentPeriodEnd,
    stripeCancelAt,
    stripeCancelAtPeriodEnd: subscription.cancel_at_period_end,
  };
}

export function stripeCancellationScheduled(
  cancelAt: Date | string | null | undefined,
  now = new Date(),
) {
  if (!cancelAt) return false;
  const parsed = new Date(cancelAt);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() > now.getTime();
}
