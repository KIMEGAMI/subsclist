export type ReviewScoreInput = {
  priceIncreased: boolean;
  daysSinceLastUse: number | null;
  alternativeAvailable: boolean;
  annualDifference: number | null;
  priority: "ESSENTIAL" | "USEFUL" | "OPTIONAL" | "UNKNOWN";
  usageFrequency: "DAILY" | "WEEKLY" | "MONTHLY" | "RARELY" | "UNKNOWN";
  businessUsePercent: number;
};

export type ReviewScore = { score: number; reasons: string[] };

export function calculateReviewScore(input: ReviewScoreInput): ReviewScore {
  let score = 0;
  const reasons: string[] = [];
  if (input.priceIncreased) { score += 20; reasons.push("公式価格が上昇しています"); }
  if (input.daysSinceLastUse !== null && input.daysSinceLastUse >= 30) { score += 30; reasons.push("30日以上利用記録がありません"); }
  if (input.alternativeAvailable) { score += 20; reasons.push("登録済みの代替サービスがあります"); }
  if (input.annualDifference !== null && input.annualDifference >= 10_000) { score += 15; reasons.push("年間差額が1万円以上あります"); }
  if (input.priority === "OPTIONAL" || input.priority === "UNKNOWN") { score += 15; reasons.push("優先度が低い、または未設定です"); }
  if (input.usageFrequency === "DAILY") { score -= 30; reasons.push("毎日利用しているため継続価値が高い可能性があります"); }
  if (input.businessUsePercent >= 100) { score -= 20; reasons.push("仕事利用が100%です"); }
  if (input.priority === "ESSENTIAL") { score -= 20; reasons.push("必須サービスに設定されています"); }
  if (!input.alternativeAvailable) { score -= 20; reasons.push("登録済みの代替サービスがありません"); }
  return { score: Math.max(0, Math.min(100, score)), reasons };
}
