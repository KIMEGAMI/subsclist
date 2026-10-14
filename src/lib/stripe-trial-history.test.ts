import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import { hasHistoricalTrialByEmail } from "./stripe-trial-history.ts";

test("historical trial lookup follows customer pages", async () => {
  const customerCalls: Array<Record<string, unknown>> = [];
  const client = {
    customers: {
      list: async (params: Record<string, unknown>) => {
        customerCalls.push(params);
        return customerCalls.length === 1
          ? { data: [{ id: "cus_recent", deleted: false }], has_more: true }
          : { data: [{ id: "cus_older", deleted: false }], has_more: false };
      },
    },
    subscriptions: {
      list: async (params: Record<string, unknown>) => ({
        data: params.customer === "cus_older"
          ? [{ id: "sub_old_trial", status: "canceled", trial_start: 1_800_000_000 }]
          : [],
        has_more: false,
      }),
    },
  } as unknown as Stripe;

  assert.equal(await hasHistoricalTrialByEmail(client, "member@example.test"), true);
  assert.equal(customerCalls.length, 2);
  assert.equal(customerCalls[1]?.starting_after, "cus_recent");
});

test("historical trial lookup follows subscription pages", async () => {
  const subscriptionCalls: Array<Record<string, unknown>> = [];
  const client = {
    customers: {
      list: async () => ({ data: [{ id: "cus_existing", deleted: false }], has_more: false }),
    },
    subscriptions: {
      list: async (params: Record<string, unknown>) => {
        subscriptionCalls.push(params);
        return subscriptionCalls.length === 1
          ? { data: [{ id: "sub_recent", status: "canceled" }], has_more: true }
          : { data: [{ id: "sub_old_trial", status: "canceled", trial_end: 1_800_000_000 }], has_more: false };
      },
    },
  } as unknown as Stripe;

  assert.equal(await hasHistoricalTrialByEmail(client, "member@example.test"), true);
  assert.equal(subscriptionCalls[1]?.starting_after, "sub_recent");
});
