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

export function monthlyAmount(price: number, cycle: string, customCycleDays?: number | null) {
  if (cycle === "YEARLY") return price / 12;
  if (cycle === "WEEKLY") return price * 4.345;
  if (cycle === "CUSTOM") return customCycleDays ? price * (30.437 / customCycleDays) : price;
  return price;
}

export function daysUntil(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export function needsReview(value?: Date | null) {
  if (!value) return true;
  return daysUntil(value) < -90;
}

export function reviewScore(item: InsightSubscription, sameCategoryCount = 1) {
  const amount = monthlyAmount(item.price, item.billingCycle, item.customCycleDays);
  const reasons: string[] = [];
  let score = 0;

  if (amount >= 3000) {
    score += 24;
    reasons.push("月額換算が高い");
  } else if (amount >= 1500) {
    score += 14;
    reasons.push("月額換算がやや高い");
  }

  if (needsReview(item.lastReviewedAt)) {
    score += 20;
    reasons.push("90日以上見直していない");
  }

  if (sameCategoryCount >= 3) {
    score += 16;
    reasons.push("同じカテゴリの契約が多い");
  }

  if (item.usageFrequency === "RARELY") {
    score += 28;
    reasons.push("利用頻度が低い");
  } else if (item.usageFrequency === "MONTHLY") {
    score += 10;
    reasons.push("利用頻度が月1回程度");
  }

  if (item.priority === "OPTIONAL") {
    score += 18;
    reasons.push("重要度が低い");
  }

  if (item.trialEndsAt && daysUntil(item.trialEndsAt) <= 14) {
    score += 14;
    reasons.push("無料トライアル終了が近い");
  }

  if (item.cancellationDeadline && daysUntil(item.cancellationDeadline) <= 14) {
    score += 14;
    reasons.push("解約期限が近い");
  }

  const normalized = Math.min(100, score);
  return {
    score: normalized,
    grade: normalized >= 70 ? "要対応" : normalized >= 40 ? "要確認" : "維持候補",
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
