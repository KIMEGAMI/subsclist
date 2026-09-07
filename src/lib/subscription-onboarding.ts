export const ONBOARDING_SUBSCRIPTION_TARGET = 5;

export type SubscriptionOnboardingInput = {
  subscriptionCount: number;
  hasCategory: boolean;
  hasPaymentMethod: boolean;
  hasBudget: boolean;
  hasBusinessUse: boolean;
  hasReviewData: boolean;
  hasUsageData: boolean;
  paymentHistoryCount: number;
  monthlyCloseCompleted: boolean;
  premium: boolean;
};

export type SubscriptionOnboardingStep = {
  key: string;
  stage: "台帳" | "支出把握" | "継続運用";
  label: string;
  description: string;
  done: boolean;
  href: string;
  action: string;
};

export type SubscriptionOnboardingSummary = {
  steps: SubscriptionOnboardingStep[];
  doneCount: number;
  progressPercent: number;
  nextStep: SubscriptionOnboardingStep | null;
};

export function subscriptionOnboardingSteps(
  input: SubscriptionOnboardingInput,
): SubscriptionOnboardingStep[] {
  return [
    {
      key: "subscriptions",
      stage: "台帳",
      label: `サブスクを${ONBOARDING_SUBSCRIPTION_TARGET}件登録`,
      description: `${Math.min(input.subscriptionCount, ONBOARDING_SUBSCRIPTION_TARGET)}/${ONBOARDING_SUBSCRIPTION_TARGET}件登録済み。固定費の全体像を作ります。`,
      done: input.subscriptionCount >= ONBOARDING_SUBSCRIPTION_TARGET,
      href: input.premium ? "/export" : "/subscriptions/new",
      action: input.premium ? "CSV取込" : "追加",
    },
    {
      key: "organization",
      stage: "台帳",
      label: "分類と支払い方法を設定",
      description: "カテゴリと決済手段を紐付け、支出の内訳を比較できる状態にします。",
      done: input.hasCategory && input.hasPaymentMethod,
      href: "/categories",
      action: "設定",
    },
    {
      key: "budget",
      stage: "支出把握",
      label: "月額予算を設定",
      description: "毎月の上限を決め、予算超過をダッシュボードと通知で把握します。",
      done: input.hasBudget,
      href: "/settings",
      action: "設定",
    },
    {
      key: "business-review",
      stage: "支出把握",
      label: "仕事利用割合と見直しを入力",
      description: "契約の用途と必要性を記録し、仕事利用分と見直し候補を整理します。",
      done: input.hasBusinessUse && input.hasReviewData,
      href: "/subscriptions",
      action: "見直す",
    },
    {
      key: "usage",
      stage: "継続運用",
      label: "実際の利用を1回記録",
      description: "使った事実を残し、未利用候補を推測ではなく利用記録から判定します。",
      done: input.hasUsageData,
      href: "/subscriptions",
      action: "記録",
    },
    {
      key: "payment-history",
      stage: "継続運用",
      label: "支払いを1回記録",
      description: "予定額と実際の請求を照合し、累計と月次レポートの根拠を作ります。",
      done: input.paymentHistoryCount > 0,
      href: "/payments",
      action: "記録",
    },
    ...(input.premium
      ? [{
          key: "monthly-close",
          stage: "継続運用" as const,
          label: "最初の月次締めを完了",
          description: "支払い、証憑、更新判断を月単位で確定し、翌月へ持ち越す課題を明確にします。",
          done: input.monthlyCloseCompleted,
          href: "/monthly-report",
          action: "締める",
        }]
      : []),
  ];
}

export function subscriptionOnboardingSummary(
  input: SubscriptionOnboardingInput,
): SubscriptionOnboardingSummary {
  const steps = subscriptionOnboardingSteps(input);
  const doneCount = steps.filter((step) => step.done).length;
  return {
    steps,
    doneCount,
    progressPercent: steps.length === 0 ? 100 : Math.round((doneCount / steps.length) * 100),
    nextStep: steps.find((step) => !step.done) ?? null,
  };
}
