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

export function stripeTimestampToDate(timestamp: number | null | undefined) {
  return timestamp ? new Date(timestamp * MILLISECONDS_PER_SECOND) : null;
}

export function canUseStripeTrial(trialUsedAt: Date | string | null | undefined) {
  return !trialUsedAt && STRIPE_TRIAL_PERIOD_DAYS >= MIN_STRIPE_TRIAL_PERIOD_DAYS;
}

export function stripeTrialCheckoutData(trialUsedAt: Date | string | null | undefined) {
  if (!canUseStripeTrial(trialUsedAt)) return {};
  return { trial_period_days: STRIPE_TRIAL_PERIOD_DAYS };
}
