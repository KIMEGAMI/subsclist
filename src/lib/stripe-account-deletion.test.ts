import assert from "node:assert/strict";
import test from "node:test";
import { stripeSubscriptionCanStillCharge } from "./stripe-account-deletion.ts";

test("終了済みのStripe契約だけをアカウント削除可能とする", () => {
  assert.equal(stripeSubscriptionCanStillCharge("canceled"), false);
  assert.equal(stripeSubscriptionCanStillCharge("incomplete_expired"), false);
});

test("再請求・再開の可能性がある状態ではアカウント削除を止める", () => {
  for (const status of [
    "active",
    "trialing",
    "past_due",
    "unpaid",
    "incomplete",
    "paused",
  ]) {
    assert.equal(stripeSubscriptionCanStillCharge(status), true);
  }
});
