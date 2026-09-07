import assert from "node:assert/strict";
import test from "node:test";
import { STRIPE_TRIAL_PERIOD_DAYS } from "./app-constants.ts";
import { canUseStripeTrial, hasAnyStripeTrial, hasStripeTrial, isStripeTrialCurrentlyActive, shouldCheckHistoricalTrialByEmail, stripePlanTrialDisplay, stripeTimestampToDate, stripeTrialCheckoutData } from "./stripe-trial.ts";

const TEST_TRIAL_TIMESTAMP_SECONDS = 1_786_579_200;

test("Stripeのtrialingまたはtrial期間を無料体験利用済みとして扱う", () => {
  assert.equal(hasStripeTrial({ status: "trialing" }), true);
  assert.equal(hasStripeTrial({ status: "canceled", trial_start: TEST_TRIAL_TIMESTAMP_SECONDS, trial_end: null }), true);
  assert.equal(hasStripeTrial({ status: "active", trial_start: null, trial_end: null }), false);
});

test("過去契約のいずれかに無料体験履歴があれば利用済みとする", () => {
  assert.equal(
    hasAnyStripeTrial([
      { status: "canceled", trial_start: null, trial_end: null },
      { status: "canceled", trial_start: TEST_TRIAL_TIMESTAMP_SECONDS },
    ]),
    true,
  );
  assert.equal(
    hasAnyStripeTrial([{ status: "active", trial_start: null, trial_end: null }]),
    false,
  );
});

test("無料体験はtrialUsedAtがないユーザーだけCheckoutに付与する", () => {
  assert.deepEqual(stripeTrialCheckoutData(null), { trial_period_days: STRIPE_TRIAL_PERIOD_DAYS });
  assert.deepEqual(stripeTrialCheckoutData(new Date("2026-08-13T00:00:00.000Z")), {});
  assert.equal(canUseStripeTrial(null), true);
  assert.equal(canUseStripeTrial("2026-08-13T00:00:00.000Z"), false);
});

test("過去メールの無料体験履歴は本番だけ確認する", () => {
  assert.equal(shouldCheckHistoricalTrialByEmail(true), false);
  assert.equal(shouldCheckHistoricalTrialByEmail(false), true);
});

test("Stripeの秒timestampをDateへ変換する", () => {
  assert.equal(stripeTimestampToDate(TEST_TRIAL_TIMESTAMP_SECONDS)?.toISOString(), "2026-08-13T00:00:00.000Z");
  assert.equal(stripeTimestampToDate(null), null);
});

test("trialingかつ終了日時より前だけ無料体験中とする", () => {
  const now = new Date("2026-08-18T00:00:00.000Z");
  assert.equal(
    isStripeTrialCurrentlyActive("trialing", "2026-08-25T00:00:00.000Z", now),
    true,
  );
  assert.equal(
    isStripeTrialCurrentlyActive("trialing", "2026-08-18T00:00:00.000Z", now),
    false,
  );
  assert.equal(
    isStripeTrialCurrentlyActive("active", "2026-08-25T00:00:00.000Z", now),
    false,
  );
});

test("Premiumは無料体験履歴がなくても契約中表示を優先する", () => {
  assert.equal(stripePlanTrialDisplay("PREMIUM", null, null, null), "PREMIUM_ACTIVE");
  assert.equal(stripePlanTrialDisplay("LIFETIME", null, null, null), "PREMIUM_ACTIVE");
});

test("有効な無料体験中はプランより無料体験状態を優先する", () => {
  const now = new Date("2026-08-18T00:00:00.000Z");
  assert.equal(
    stripePlanTrialDisplay("PREMIUM", "trialing", "2026-08-25T00:00:00.000Z", null, now),
    "ACTIVE_TRIAL",
  );
});

test("Stripe契約がないFreeは無料体験の利用可否を履歴から表示する", () => {
  assert.equal(stripePlanTrialDisplay("FREE", null, null, null), "TRIAL_AVAILABLE");
  assert.equal(
    stripePlanTrialDisplay(
      "FREE",
      null,
      null,
      "2026-08-13T00:00:00.000Z",
    ),
    "TRIAL_USED",
  );
});

test("支払い異常と一時停止を通常のPremium表示にしない", () => {
  const now = new Date("2026-08-28T00:00:00.000Z");
  assert.equal(stripePlanTrialDisplay("PREMIUM", "past_due", null, now, now), "PAYMENT_PAST_DUE");
  assert.equal(stripePlanTrialDisplay("FREE", "unpaid", null, now, now), "PAYMENT_UNPAID");
  assert.equal(stripePlanTrialDisplay("FREE", "incomplete", null, null, now), "PAYMENT_INCOMPLETE");
  assert.equal(stripePlanTrialDisplay("FREE", "paused", null, now, now), "SUBSCRIPTION_PAUSED");
});

test("終了したStripe契約を無料体験案内に戻さない", () => {
  const now = new Date("2026-08-28T00:00:00.000Z");
  assert.equal(stripePlanTrialDisplay("FREE", "canceled", null, now, now), "SUBSCRIPTION_ENDED");
  assert.equal(
    stripePlanTrialDisplay("FREE", "incomplete_expired", null, null, now),
    "SUBSCRIPTION_ENDED",
  );
});
