import {
  MIN_STRIPE_TRIAL_PERIOD_DAYS,
  STRIPE_TRIAL_PERIOD_DAYS,
  STRIPE_TRIALING_STATUS,
} from "@/lib/app-constants";

type StripeTrialState = {
  status?: string | null;
  trial_start?: number | null;
  trial_end?: number | null;
};

export function hasStripeTrial(subscription: StripeTrialState) {
  return subscription.status === STRIPE_TRIALING_STATUS || Boolean(subscription.trial_start) || Boolean(subscription.trial_end);
}

export function canUseStripeTrial(trialUsedAt: Date | string | null | undefined) {
  return !trialUsedAt && STRIPE_TRIAL_PERIOD_DAYS >= MIN_STRIPE_TRIAL_PERIOD_DAYS;
}

export function stripeTrialCheckoutData(trialUsedAt: Date | string | null | undefined) {
  if (!canUseStripeTrial(trialUsedAt)) return {};
  return { trial_period_days: STRIPE_TRIAL_PERIOD_DAYS };
}
