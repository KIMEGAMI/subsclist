import assert from "node:assert/strict";
import test from "node:test";
import { STRIPE_TRIAL_PERIOD_DAYS } from "./app-constants.ts";
import { canUseStripeTrial, hasStripeTrial, stripeTimestampToDate, stripeTrialCheckoutData } from "./stripe-trial.ts";

const TEST_TRIAL_TIMESTAMP_SECONDS = 1_786_579_200;

test("Stripeのtrialingまたはtrial期間を無料体験利用済みとして扱う", () => {
  assert.equal(hasStripeTrial({ status: "trialing" }), true);
  assert.equal(hasStripeTrial({ status: "canceled", trial_start: TEST_TRIAL_TIMESTAMP_SECONDS, trial_end: null }), true);
  assert.equal(hasStripeTrial({ status: "active", trial_start: null, trial_end: null }), false);
});

test("無料体験はtrialUsedAtがないユーザーだけCheckoutに付与する", () => {
  assert.deepEqual(stripeTrialCheckoutData(null), { trial_period_days: STRIPE_TRIAL_PERIOD_DAYS });
  assert.deepEqual(stripeTrialCheckoutData(new Date("2026-08-13T00:00:00.000Z")), {});
  assert.equal(canUseStripeTrial(null), true);
  assert.equal(canUseStripeTrial("2026-08-13T00:00:00.000Z"), false);
});

test("Stripeの秒timestampをDateへ変換する", () => {
  assert.equal(stripeTimestampToDate(TEST_TRIAL_TIMESTAMP_SECONDS)?.toISOString(), "2026-08-13T00:00:00.000Z");
  assert.equal(stripeTimestampToDate(null), null);
});
