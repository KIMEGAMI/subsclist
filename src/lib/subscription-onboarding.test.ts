import assert from "node:assert/strict";
import test from "node:test";
import {
  ONBOARDING_SUBSCRIPTION_TARGET,
  subscriptionOnboardingSummary,
  subscriptionOnboardingSteps,
} from "./subscription-onboarding.ts";

const completeInput = {
  subscriptionCount: ONBOARDING_SUBSCRIPTION_TARGET,
  hasCategory: true,
  hasPaymentMethod: true,
  hasBudget: true,
  hasBusinessUse: true,
  hasReviewData: true,
  hasUsageData: true,
  paymentHistoryCount: 1,
  monthlyCloseCompleted: true,
  premium: true,
};

test("初期設定は実利用まで完了したときだけ全項目完了になる", () => {
  const steps = subscriptionOnboardingSteps(completeInput);
  assert.equal(steps.length, 7);
  assert.equal(steps.every((step) => step.done), true);
});

test("サブスク登録は5件を達成条件にする", () => {
  const beforeTarget = subscriptionOnboardingSteps({
    ...completeInput,
    subscriptionCount: ONBOARDING_SUBSCRIPTION_TARGET - 1,
  });
  assert.equal(beforeTarget.find((step) => step.key === "subscriptions")?.done, false);
});

test("仕事利用割合と見直しは両方の入力を必要とする", () => {
  const withoutBusinessUse = subscriptionOnboardingSteps({
    ...completeInput,
    hasBusinessUse: false,
  });
  const withoutReview = subscriptionOnboardingSteps({
    ...completeInput,
    hasReviewData: false,
  });
  assert.equal(withoutBusinessUse.find((step) => step.key === "business-review")?.done, false);
  assert.equal(withoutReview.find((step) => step.key === "business-review")?.done, false);
});

test("FreeプランにはPremium限定の月次締めを達成条件として表示しない", () => {
  const steps = subscriptionOnboardingSteps({
    ...completeInput,
    premium: false,
    monthlyCloseCompleted: false,
  });
  assert.equal(steps.length, 6);
  assert.equal(steps.some((step) => step.key === "monthly-close"), false);
});

test("未完了の先頭項目と到達率を返す", () => {
  const summary = subscriptionOnboardingSummary({
    ...completeInput,
    hasBudget: false,
    hasUsageData: false,
    paymentHistoryCount: 0,
    monthlyCloseCompleted: false,
  });
  assert.equal(summary.doneCount, 3);
  assert.equal(summary.progressPercent, 43);
  assert.equal(summary.nextStep?.key, "budget");
});

test("支払い実績がなければ継続運用は未完了になる", () => {
  const steps = subscriptionOnboardingSteps({ ...completeInput, paymentHistoryCount: 0 });
  assert.equal(steps.find((step) => step.key === "payment-history")?.done, false);
});
