import type Stripe from "stripe";
import {
  STRIPE_SUBSCRIPTION_STATUS_ALL,
  STRIPE_TRIAL_LOOKBACK_PAGE_SIZE,
} from "./app-constants.ts";
import { hasAnyStripeTrial } from "./stripe-trial.ts";

export async function hasHistoricalTrialByEmail(client: Stripe, email: string) {
  let customerCursor: string | undefined;
  while (true) {
    const customers = await client.customers.list({
      email,
      limit: STRIPE_TRIAL_LOOKBACK_PAGE_SIZE,
      ...(customerCursor ? { starting_after: customerCursor } : {}),
    });
    for (const customer of customers.data) {
      if (customer.deleted) continue;

      let subscriptionCursor: string | undefined;
      while (true) {
        const subscriptions = await client.subscriptions.list({
          customer: customer.id,
          status: STRIPE_SUBSCRIPTION_STATUS_ALL,
          limit: STRIPE_TRIAL_LOOKBACK_PAGE_SIZE,
          ...(subscriptionCursor ? { starting_after: subscriptionCursor } : {}),
        });
        if (hasAnyStripeTrial(subscriptions.data)) return true;
        const lastSubscription = subscriptions.data.at(-1);
        if (!subscriptions.has_more) break;
        if (!lastSubscription) throw new Error("Stripe returned an incomplete subscription page");
        subscriptionCursor = lastSubscription.id;
      }
    }

    const lastCustomer = customers.data.at(-1);
    if (!customers.has_more) break;
    if (!lastCustomer) throw new Error("Stripe returned an incomplete customer page");
    customerCursor = lastCustomer.id;
  }
  return false;
}
