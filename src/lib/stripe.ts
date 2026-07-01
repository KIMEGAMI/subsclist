import Stripe from "stripe";
import { assertStripeEnv, assertStripeWebhookEnv, env } from "@/lib/env";

let stripeClient: Stripe | null = null;

export function stripe() {
  assertStripeEnv();
  stripeClient ??= new Stripe(env.stripeSecretKey);
  return stripeClient;
}

export function stripeForWebhook() {
  assertStripeWebhookEnv();
  stripeClient ??= new Stripe(env.stripeSecretKey);
  return stripeClient;
}
