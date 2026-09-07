import { MONTHLY_CLOSE_SCORE_PENALTY } from "./app-constants.ts";

const OPERATION_SCORE_RULES = {
  maximum: 100,
  urgent: { pointsPerItem: 10, maximumPenalty: 30 },
  review: { pointsPerItem: 5, maximumPenalty: 25 },
  lowUsage: { pointsPerItem: 5, maximumPenalty: 15 },
  dataQualityTarget: 80,
  budgetMaximumPenalty: 20,
  budgetOverageWeight: 30,
} as const;

export type OperationScoreInput = {
  urgentCount: number;
  reviewCount: number;
  lowUsageCount: number;
  dataQuality: number;
  monthlyTotal: number;
  monthlyBudget: number | null;
  monthlyCloseCompleted: boolean;
};

function itemPenalty(count: number, pointsPerItem: number, maximumPenalty: number) {
  return Math.min(maximumPenalty, Math.max(0, count) * pointsPerItem);
}

function budgetPenalty(monthlyTotal: number, monthlyBudget: number | null) {
  if (!monthlyBudget || monthlyTotal <= monthlyBudget || monthlyTotal <= 0) return 0;

  return Math.min(
    OPERATION_SCORE_RULES.budgetMaximumPenalty,
    Math.round(
      ((monthlyTotal - monthlyBudget) / monthlyTotal) *
        OPERATION_SCORE_RULES.budgetOverageWeight,
    ),
  );
}

export function calculateOperationScore(input: OperationScoreInput) {
  const penalty =
    itemPenalty(input.urgentCount, OPERATION_SCORE_RULES.urgent.pointsPerItem, OPERATION_SCORE_RULES.urgent.maximumPenalty) +
    itemPenalty(input.reviewCount, OPERATION_SCORE_RULES.review.pointsPerItem, OPERATION_SCORE_RULES.review.maximumPenalty) +
    itemPenalty(input.lowUsageCount, OPERATION_SCORE_RULES.lowUsage.pointsPerItem, OPERATION_SCORE_RULES.lowUsage.maximumPenalty) +
    Math.max(0, OPERATION_SCORE_RULES.dataQualityTarget - input.dataQuality) +
    budgetPenalty(input.monthlyTotal, input.monthlyBudget) +
    (input.monthlyCloseCompleted ? 0 : MONTHLY_CLOSE_SCORE_PENALTY);

  return Math.max(0, OPERATION_SCORE_RULES.maximum - penalty);
}
