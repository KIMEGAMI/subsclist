import { daysUntil, monthlyAmount } from "@/lib/billing";
import {
  REVIEW_CAUTION_SCORE_THRESHOLD,
  REVIEW_HIGH_AMOUNT_THRESHOLD,
  REVIEW_MEDIUM_AMOUNT_THRESHOLD,
  REVIEW_SCORE_WEIGHTS,
  REVIEW_STALE_DAYS,
  REVIEW_URGENT_SCORE_THRESHOLD,
  SAME_CATEGORY_REVIEW_THRESHOLD,
  UPCOMING_DEADLINE_DAYS,
} from "@/lib/app-constants";

export { daysUntil, monthlyAmount } from "@/lib/billing";

export type InsightSubscription = {
  id: string;
  name: string;
  price: number;
  billingCycle: string;
  customCycleDays?: number | null;
  nextBillingDate: Date;
  trialEndsAt?: Date | null;
  cancellationDeadline?: Date | null;
  lastReviewedAt?: Date | null;
  usageFrequency?: string | null;
  priority?: string | null;
  category?: { name: string } | null;
};

export function needsReview(value?: Date | null) {
  if (!value) return true;
  return daysUntil(value) < -REVIEW_STALE_DAYS;
}

export function reviewScore(item: InsightSubscription, sameCategoryCount = 1) {
  const amount = monthlyAmount(item.price, item.billingCycle, item.customCycleDays);
  const reasons: string[] = [];
  let score = 0;

  if (amount >= REVIEW_HIGH_AMOUNT_THRESHOLD) {
    score += REVIEW_SCORE_WEIGHTS.highAmount;
    reasons.push("月額換算が高い");
  } else if (amount >= REVIEW_MEDIUM_AMOUNT_THRESHOLD) {
    score += REVIEW_SCORE_WEIGHTS.mediumAmount;
    reasons.push("月額換算がやや高い");
  }

  if (needsReview(item.lastReviewedAt)) {
    score += REVIEW_SCORE_WEIGHTS.staleReview;
    reasons.push(`${REVIEW_STALE_DAYS}日以上見直していない`);
  }

  if (sameCategoryCount >= SAME_CATEGORY_REVIEW_THRESHOLD) {
    score += REVIEW_SCORE_WEIGHTS.duplicateCategory;
    reasons.push("同じカテゴリの契約が多い");
  }

  if (item.usageFrequency === "RARELY") {
    score += REVIEW_SCORE_WEIGHTS.rarelyUsed;
    reasons.push("利用頻度が低い");
  } else if (item.usageFrequency === "MONTHLY") {
    score += REVIEW_SCORE_WEIGHTS.monthlyUse;
    reasons.push("利用頻度が月1回程度");
  }

  if (item.priority === "OPTIONAL") {
    score += REVIEW_SCORE_WEIGHTS.optionalPriority;
    reasons.push("重要度が低い");
  }

  if (item.trialEndsAt && daysUntil(item.trialEndsAt) <= UPCOMING_DEADLINE_DAYS) {
    score += REVIEW_SCORE_WEIGHTS.upcomingTrial;
    reasons.push("無料トライアル終了が近い");
  }

  if (item.cancellationDeadline && daysUntil(item.cancellationDeadline) <= UPCOMING_DEADLINE_DAYS) {
    score += REVIEW_SCORE_WEIGHTS.upcomingCancellation;
    reasons.push("解約期限が近い");
  }

  const normalized = Math.min(100, score);
  return {
    score: normalized,
    grade: normalized >= REVIEW_URGENT_SCORE_THRESHOLD ? "要対応" : normalized >= REVIEW_CAUTION_SCORE_THRESHOLD ? "要確認" : "維持候補",
    reasons: reasons.length ? reasons : ["大きな懸念はありません"],
  };
}

export function estimatedMonthlySaving(item: InsightSubscription) {
  const amount = monthlyAmount(item.price, item.billingCycle, item.customCycleDays);
  if (item.usageFrequency === "RARELY" || item.priority === "OPTIONAL") {
    return amount;
  }
  return 0;
}
