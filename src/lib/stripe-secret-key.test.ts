import assert from "node:assert/strict";
import test from "node:test";
import {
  isStripeLiveModeAllowed,
  isStripeServerSecretKey,
} from "./stripe-secret-key.ts";

test("only Stripe server-side test and live keys are accepted", () => {
  assert.equal(isStripeServerSecretKey("sk_test_example"), true);
  assert.equal(isStripeServerSecretKey("sk_live_example"), true);
  assert.equal(isStripeServerSecretKey("pk_test_example"), false);
});

test("test key is allowed without the live-mode opt-in", () => {
  assert.equal(isStripeLiveModeAllowed("sk_test_example", undefined, "development"), true);
});

test("live key requires explicit opt-in in development", () => {
  assert.equal(isStripeLiveModeAllowed("sk_live_example", undefined, "development"), false);
  assert.equal(isStripeLiveModeAllowed("sk_live_example", "true", "development"), true);
});

test("live key is denied in test environments even with the opt-in", () => {
  assert.equal(isStripeLiveModeAllowed("sk_live_example", "true", "test"), false);
});

test("live key requires explicit opt-in in production", () => {
  assert.equal(isStripeLiveModeAllowed("sk_live_example", "true", "production"), true);
  assert.equal(isStripeLiveModeAllowed("sk_live_example", "false", "production"), false);
  assert.equal(isStripeLiveModeAllowed("sk_live_example", undefined, "production"), false);
});
