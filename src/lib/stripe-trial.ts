import {
  MIN_STRIPE_TRIAL_PERIOD_DAYS,
  STRIPE_TRIAL_PERIOD_DAYS,
  STRIPE_TRIALING_STATUS,
} from "./app-constants.ts";
import { MILLISECONDS_PER_SECOND } from "./billing.ts";

type StripeTrialState = {
  status?: string | null;
  trial_start?: number | null;
  trial_end?: number | null;
};

export function hasStripeTrial(subscription: StripeTrialState) {
  return subscription.status === STRIPE_TRIALING_STATUS || Boolean(subscription.trial_start) || Boolean(subscription.trial_end);
}

export function hasAnyStripeTrial(subscriptions: StripeTrialState[]) {
  return subscriptions.some(hasStripeTrial);
}

export function stripeTimestampToDate(timestamp: number | null | undefined) {
  return timestamp ? new Date(timestamp * MILLISECONDS_PER_SECOND) : null;
}

export function isStripeTrialCurrentlyActive(
  status: string | null | undefined,
  trialEndAt: Date | string | null | undefined,
  now = new Date(),
) {
  if (status !== STRIPE_TRIALING_STATUS || !trialEndAt) return false;
  const trialEnd = new Date(trialEndAt);
  return !Number.isNaN(trialEnd.getTime()) && trialEnd.getTime() > now.getTime();
}

export type StripePlanTrialDisplay =
  | "ACTIVE_TRIAL"
  | "PREMIUM_ACTIVE"
  | "PAYMENT_PAST_DUE"
  | "PAYMENT_UNPAID"
  | "PAYMENT_INCOMPLETE"
  | "SUBSCRIPTION_PAUSED"
  | "SUBSCRIPTION_ENDED"
  | "TRIAL_AVAILABLE"
  | "TRIAL_USED";

export function stripePlanTrialDisplay(
  plan: string,
  status: string | null | undefined,
  trialEndAt: Date | string | null | undefined,
  trialUsedAt: Date | string | null | undefined,
  now = new Date(),
): StripePlanTrialDisplay {
  if (isStripeTrialCurrentlyActive(status, trialEndAt, now)) {
    return "ACTIVE_TRIAL";
  }
  if (status === "past_due") return "PAYMENT_PAST_DUE";
  if (status === "unpaid") return "PAYMENT_UNPAID";
  if (status === "incomplete") return "PAYMENT_INCOMPLETE";
  if (status === "paused") return "SUBSCRIPTION_PAUSED";
  if (status === "canceled" || status === "incomplete_expired") return "SUBSCRIPTION_ENDED";
  if (plan === "PREMIUM" || plan === "LIFETIME") {
    return "PREMIUM_ACTIVE";
  }
  return canUseStripeTrial(trialUsedAt) ? "TRIAL_AVAILABLE" : "TRIAL_USED";
}

export function canUseStripeTrial(trialUsedAt: Date | string | null | undefined) {
  return !trialUsedAt && STRIPE_TRIAL_PERIOD_DAYS >= MIN_STRIPE_TRIAL_PERIOD_DAYS;
}

export function stripeTrialCheckoutData(trialUsedAt: Date | string | null | undefined) {
  if (!canUseStripeTrial(trialUsedAt)) return {};
  return { trial_period_days: STRIPE_TRIAL_PERIOD_DAYS };
}

export function shouldCheckHistoricalTrialByEmail(stripeTestMode: boolean) {
  return !stripeTestMode;
}
