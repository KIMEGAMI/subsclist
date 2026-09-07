import assert from "node:assert/strict";
import test from "node:test";
import {
  activePlan,
  canApplyStripeSubscription,
  hasPremiumStripeStatus,
  stripeBillingSyncOutcome,
  stripeSubscriptionCanBeManaged,
} from "./stripe-entitlement.ts";

test("active、trialing、past_dueはPremium権限を維持する", () => {
  for (const status of ["active", "trialing", "past_due"]) {
    assert.equal(activePlan(status), "PREMIUM");
    assert.equal(hasPremiumStripeStatus(status), true);
  }
  for (const status of ["unpaid", "canceled", "incomplete_expired", null]) {
    assert.equal(activePlan(status), "FREE");
  }
});

test("支払い対応が必要な契約は重複加入させずStripeで管理できる", () => {
  for (const status of ["past_due", "unpaid", "incomplete", "paused"]) {
    assert.equal(stripeSubscriptionCanBeManaged(status), true);
    assert.equal(stripeBillingSyncOutcome(status), "attention");
  }
  for (const status of ["canceled", "incomplete_expired", null]) {
    assert.equal(stripeSubscriptionCanBeManaged(status), false);
  }
});

test("正常契約と終了契約の同期結果を分ける", () => {
  assert.equal(stripeBillingSyncOutcome("active"), "premium");
  assert.equal(stripeBillingSyncOutcome("trialing"), "premium");
  assert.equal(stripeBillingSyncOutcome("canceled"), "free");
  assert.equal(stripeBillingSyncOutcome("incomplete_expired"), "free");
});

test("異なるStripe顧客のイベントを拒否する", () => {
  assert.equal(
    canApplyStripeSubscription(
      {
        customerId: "cus_current",
        subscriptionId: "sub_current",
        status: "active",
      },
      {
        customerId: "cus_other",
        subscriptionId: "sub_other",
        status: "active",
      },
    ),
    false,
  );
});

test("古い解約イベントで新しいPremium契約を上書きしない", () => {
  assert.equal(
    canApplyStripeSubscription(
      { customerId: "cus_1", subscriptionId: "sub_new", status: "active" },
      { customerId: "cus_1", subscriptionId: "sub_old", status: "canceled" },
    ),
    false,
  );
});

test("失効済み契約は同じ顧客の新しい有効契約へ置き換えられる", () => {
  assert.equal(
    canApplyStripeSubscription(
      { customerId: "cus_1", subscriptionId: "sub_old", status: "canceled" },
      { customerId: "cus_1", subscriptionId: "sub_new", status: "active" },
    ),
    true,
  );
});
test("無料トライアル終了後の同一Stripe契約はtrialingからactiveへ更新できる", () => {
  assert.equal(
    canApplyStripeSubscription(
      { customerId: "cus_1", subscriptionId: "sub_trial", status: "trialing" },
      { customerId: "cus_1", subscriptionId: "sub_trial", status: "active" },
    ),
    true,
  );
});
