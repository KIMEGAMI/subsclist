import type Stripe from "stripe";
import { storedStripeCustomerCanBelongToUser } from "./stripe-customer-ownership.ts";

type StripeCustomerProfile = {
  id: string;
  email: string;
  name?: string | null;
};

export async function syncStripeCustomerProfile(
  client: Stripe,
  customerId: string,
  profile: StripeCustomerProfile,
) {
  const customer = await client.customers.retrieve(customerId);
  if (
    customer.deleted ||
    !storedStripeCustomerCanBelongToUser(
      customer.metadata.userId,
      profile.id,
    )
  ) {
    return false;
  }

  await client.customers.update(customer.id, {
    email: profile.email,
    name: profile.name ?? undefined,
    metadata: { ...customer.metadata, userId: profile.id },
  });
  return true;
}
