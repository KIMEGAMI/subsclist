export const CANCELLATION_CANDIDATE_MINIMUM_SCORE = 1;
export const CANCELLATION_CANDIDATE_WEIGHTS = {
  unused30Days: 3,
  unused60Days: 5,
  unused90Days: 8,
  rareUsage: 2,
  optionalPriority: 2,
  duplicateCategory: 2,
  highCost: 2,
} as const;

export type CancellationCandidateInput = {
  id: string;
  name: string;
  monthlyCost: number;
  unusedDays: 0 | 30 | 60 | 90;
  usageFrequency: string;
  priority: string;
  duplicateCategory: boolean;
  isHighCost: boolean;
};

export type CancellationCandidate = {
  id: string;
  name: string;
  monthlyCost: number;
  annualSaving: number;
  score: number;
  reasons: string[];
};

function unusedScore(unusedDays: CancellationCandidateInput["unusedDays"]): number {
  if (unusedDays === 90) return CANCELLATION_CANDIDATE_WEIGHTS.unused90Days;
  if (unusedDays === 60) return CANCELLATION_CANDIDATE_WEIGHTS.unused60Days;
  if (unusedDays === 30) return CANCELLATION_CANDIDATE_WEIGHTS.unused30Days;
  return 0;
}

function unusedReason(unusedDays: CancellationCandidateInput["unusedDays"]): string | null {
  return unusedDays === 0 ? null : `${unusedDays}日以上利用されていません。`;
}

export function detectCancellationCandidates(items: CancellationCandidateInput[], monthsPerYear: number): CancellationCandidate[] {
  return items.flatMap((item) => {
    const reasons = [unusedReason(item.unusedDays)].filter((reason): reason is string => Boolean(reason));
    let score = unusedScore(item.unusedDays);

    if (item.usageFrequency === "RARELY") {
      score += CANCELLATION_CANDIDATE_WEIGHTS.rareUsage;
      reasons.push("利用頻度が低い設定です。");
    }
    if (item.priority === "OPTIONAL") {
      score += CANCELLATION_CANDIDATE_WEIGHTS.optionalPriority;
      reasons.push("重要度が「任意」です。");
    }
    if (item.duplicateCategory) {
      score += CANCELLATION_CANDIDATE_WEIGHTS.duplicateCategory;
      reasons.push("同じカテゴリに複数の契約があります。");
    }
    if (item.isHighCost) {
      score += CANCELLATION_CANDIDATE_WEIGHTS.highCost;
      reasons.push("月額換算が高額です。");
    }
    if (score < CANCELLATION_CANDIDATE_MINIMUM_SCORE) return [];

    return [{ id: item.id, name: item.name, monthlyCost: item.monthlyCost, annualSaving: item.monthlyCost * monthsPerYear, score, reasons }];
  }).sort((left, right) => right.score - left.score || right.monthlyCost - left.monthlyCost);
}
