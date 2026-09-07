import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import { syncStripeCustomerProfile } from "./stripe-customer-profile.ts";

function stripeClientForCustomer(customer: object) {
  let updateCalls = 0;
  const client = {
    customers: {
      retrieve: async () => customer,
      update: async () => {
        updateCalls += 1;
        return customer;
      },
    },
  } as unknown as Stripe;
  return { client, updateCalls: () => updateCalls };
}

test("本人のStripe顧客だけプロフィールを同期する", async () => {
  const fixture = stripeClientForCustomer({
    id: "cus_test",
    deleted: false,
    metadata: { userId: "user-1" },
  });
  assert.equal(
    await syncStripeCustomerProfile(fixture.client, "cus_test", {
      id: "user-1",
      email: "new@example.com",
      name: "利用者",
    }),
    true,
  );
  assert.equal(fixture.updateCalls(), 1);
});

test("別ユーザーまたは削除済みのStripe顧客は更新しない", async () => {
  const other = stripeClientForCustomer({
    id: "cus_other",
    deleted: false,
    metadata: { userId: "user-2" },
  });
  assert.equal(
    await syncStripeCustomerProfile(other.client, "cus_other", {
      id: "user-1",
      email: "new@example.com",
    }),
    false,
  );
  assert.equal(other.updateCalls(), 0);

  const deleted = stripeClientForCustomer({
    id: "cus_deleted",
    deleted: true,
  });
  assert.equal(
    await syncStripeCustomerProfile(deleted.client, "cus_deleted", {
      id: "user-1",
      email: "new@example.com",
    }),
    false,
  );
  assert.equal(deleted.updateCalls(), 0);
});
