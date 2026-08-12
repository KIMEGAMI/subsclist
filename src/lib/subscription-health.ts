export const HEALTH_SCORE_MAX = 100;
export const HEALTH_SCORE_PENALTIES = {
  unusedThisMonth: 5,
  unusedNinetyDays: 12,
  duplicateCategory: 4,
  budgetOverrun: 15,
  cancellationCandidate: 6,
} as const;

export type SubscriptionHealthInput = {
  hasUsageData: boolean;
  unusedThisMonthCount: number;
  unusedNinetyDaysCount: number;
  duplicateCategoryCount: number;
  budgetExceeded: boolean;
  cancellationCandidateCount: number;
};

export type SubscriptionHealthResult = {
  score: number;
  label: "非常に良好" | "良好" | "見直し推奨" | "無駄あり" | "要整理";
  reasons: string[];
};

function scoreLabel(score: number): SubscriptionHealthResult["label"] {
  if (score >= 90) return "非常に良好";
  if (score >= 75) return "良好";
  if (score >= 60) return "見直し推奨";
  if (score >= 40) return "無駄あり";
  return "要整理";
}

export function calculateSubscriptionHealth(input: SubscriptionHealthInput): SubscriptionHealthResult {
  let score = HEALTH_SCORE_MAX;
  const reasons: string[] = [];

  if (input.hasUsageData) {
    score -= input.unusedThisMonthCount * HEALTH_SCORE_PENALTIES.unusedThisMonth;
    if (input.unusedThisMonthCount > 0) reasons.push(`今月未使用のサブスクが${input.unusedThisMonthCount}件あります。`);

    score -= input.unusedNinetyDaysCount * HEALTH_SCORE_PENALTIES.unusedNinetyDays;
    if (input.unusedNinetyDaysCount > 0) reasons.push(`90日間未使用のサブスクが${input.unusedNinetyDaysCount}件あります。`);
  } else {
    reasons.push("利用実績を記録すると、より正確に診断できます。");
  }

  score -= input.duplicateCategoryCount * HEALTH_SCORE_PENALTIES.duplicateCategory;
  if (input.duplicateCategoryCount > 0) reasons.push(`カテゴリ内の重複候補が${input.duplicateCategoryCount}件あります。`);

  if (input.budgetExceeded) {
    score -= HEALTH_SCORE_PENALTIES.budgetOverrun;
    reasons.push("月額予算を超過しています。");
  }

  score -= input.cancellationCandidateCount * HEALTH_SCORE_PENALTIES.cancellationCandidate;
  if (input.cancellationCandidateCount > 0) reasons.push(`見直し候補が${input.cancellationCandidateCount}件あります。`);

  const normalizedScore = Math.max(0, Math.min(HEALTH_SCORE_MAX, score));
  return { score: normalizedScore, label: scoreLabel(normalizedScore), reasons };
}
