import assert from "node:assert/strict";
import test from "node:test";
import {
  canUseDeletedSubscriptionPayload,
  isStripeSubscriptionEvent,
} from "./stripe-webhook.ts";

test("契約状態を変更するStripeイベントだけを契約同期対象にする", () => {
  assert.equal(isStripeSubscriptionEvent("customer.subscription.created"), true);
  assert.equal(isStripeSubscriptionEvent("customer.subscription.updated"), true);
  assert.equal(isStripeSubscriptionEvent("customer.subscription.deleted"), true);
  assert.equal(isStripeSubscriptionEvent("customer.created"), false);
  assert.equal(isStripeSubscriptionEvent("invoice.paid"), false);
});

test("削除済み契約の署名済み本文は取得不能かつ解約済みの場合だけ使う", () => {
  assert.equal(
    canUseDeletedSubscriptionPayload("canceled", "resource_missing"),
    true,
  );
  assert.equal(
    canUseDeletedSubscriptionPayload("active", "resource_missing"),
    false,
  );
  assert.equal(canUseDeletedSubscriptionPayload("canceled", "api_error"), false);
});
