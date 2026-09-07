import { japanCalendarDate } from "./subscription-usage.ts";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

export const REVIEW_OUTCOME_STALE_DAYS = 14;

export type ReviewOutcomeStage =
  | "CANDIDATE"
  | "DECIDED"
  | "IN_PROGRESS"
  | "REALIZED";

export type ReviewOutcomeCancellationStatus =
  | "NONE"
  | "CONSIDERING"
  | "PLANNED"
  | "REQUESTED"
  | "COMPLETED";

export type ReviewOutcomeDecisionStatus =
  | "CONTINUE"
  | "CANCEL_PLANNED"
  | "HOLD";

export type ReviewOutcomeSubscription = {
  id: string;
  name: string;
  monthlyCost: number;
  candidateMonthlySaving: number;
  isCandidate: boolean;
  cancellationStatus: ReviewOutcomeCancellationStatus;
  plannedCancelAt: Date | null;
  updatedAt: Date;
};

export type ReviewOutcomeDecision = {
  subscriptionId: string;
  status: ReviewOutcomeDecisionStatus;
  potentialMonthlySaving: number;
  decidedAt: Date;
};

export type ReviewOutcomeCompletedSubscription = {
  id: string;
  name: string;
  monthlyCost: number;
  cancellationCompletedAt: Date;
};

export type ReviewOutcomeItem = {
  id: string;
  name: string;
  stage: ReviewOutcomeStage;
  statusLabel: string;
  monthlyAmount: number;
  nextAction: string;
  attentionReason: string | null;
  occurredAt: Date | null;
};

const stageMeta: Record<ReviewOutcomeStage, { label: string; description: string }> = {
  CANDIDATE: { label: "見直し候補", description: "根拠を確認して判断する段階" },
  DECIDED: { label: "判断済み", description: "今月の方針を記録した段階" },
  IN_PROGRESS: { label: "解約手続き", description: "予定・申請・完了確認を進める段階" },
  REALIZED: { label: "削減実績", description: "解約完了として確定した成果" },
};

function elapsedJapanDays(date: Date, referenceDate: Date) {
  const elapsed = japanCalendarDate(referenceDate).getTime() - japanCalendarDate(date).getTime();
  return Math.max(0, Math.floor(elapsed / MILLISECONDS_PER_DAY));
}

function cancellationProgress(status: ReviewOutcomeCancellationStatus) {
  if (status === "CONSIDERING") {
    return { label: "検討中", nextAction: "解約予定日と手順を決める" };
  }
  if (status === "PLANNED") {
    return { label: "解約予定", nextAction: "期限までに解約申請を行う" };
  }
  return { label: "解約申請済み", nextAction: "受付記録を残して完了を確認する" };
}

function decisionProgress(status: ReviewOutcomeDecisionStatus) {
  if (status === "CANCEL_PLANNED") {
    return { label: "解約を検討", nextAction: "契約詳細で解約支援を開始する" };
  }
  if (status === "HOLD") {
    return { label: "再検討", nextAction: "再検討条件と次回更新日を確認する" };
  }
  return { label: "継続", nextAction: "利用状況を記録して次回判断に備える" };
}

function latestDecisionBySubscription(decisions: ReviewOutcomeDecision[]) {
  const result = new Map<string, ReviewOutcomeDecision>();
  for (const decision of [...decisions].sort((left, right) => right.decidedAt.getTime() - left.decidedAt.getTime())) {
    if (!result.has(decision.subscriptionId)) result.set(decision.subscriptionId, decision);
  }
  return result;
}

export function buildReviewOutcomePipeline(
  subscriptions: ReviewOutcomeSubscription[],
  decisions: ReviewOutcomeDecision[],
  completedSubscriptions: ReviewOutcomeCompletedSubscription[],
  referenceDate = new Date(),
) {
  const latestDecisions = latestDecisionBySubscription(decisions);
  const items: ReviewOutcomeItem[] = [];

  for (const subscription of subscriptions) {
    if (subscription.cancellationStatus === "COMPLETED") continue;

    if (
      subscription.cancellationStatus === "CONSIDERING"
      || subscription.cancellationStatus === "PLANNED"
      || subscription.cancellationStatus === "REQUESTED"
    ) {
      const progress = cancellationProgress(subscription.cancellationStatus);
      const plannedDateOverdue = subscription.plannedCancelAt
        ? japanCalendarDate(subscription.plannedCancelAt) < japanCalendarDate(referenceDate)
        : false;
      const stale = elapsedJapanDays(subscription.updatedAt, referenceDate) >= REVIEW_OUTCOME_STALE_DAYS;
      items.push({
        id: subscription.id,
        name: subscription.name,
        stage: "IN_PROGRESS",
        statusLabel: progress.label,
        monthlyAmount: Math.max(0, subscription.monthlyCost),
        nextAction: progress.nextAction,
        attentionReason: plannedDateOverdue
          ? "解約予定日を過ぎています"
          : stale
            ? `${REVIEW_OUTCOME_STALE_DAYS}日以上更新されていません`
            : null,
        occurredAt: subscription.updatedAt,
      });
      continue;
    }

    const decision = latestDecisions.get(subscription.id);
    if (decision) {
      const progress = decisionProgress(decision.status);
      const stale = decision.status !== "CONTINUE"
        && elapsedJapanDays(decision.decidedAt, referenceDate) >= REVIEW_OUTCOME_STALE_DAYS;
      items.push({
        id: subscription.id,
        name: subscription.name,
        stage: "DECIDED",
        statusLabel: progress.label,
        monthlyAmount: decision.status === "CANCEL_PLANNED"
          ? Math.max(0, decision.potentialMonthlySaving)
          : 0,
        nextAction: progress.nextAction,
        attentionReason: stale ? `${REVIEW_OUTCOME_STALE_DAYS}日以上次の手続きに進んでいません` : null,
        occurredAt: decision.decidedAt,
      });
      continue;
    }

    if (subscription.isCandidate) {
      items.push({
        id: subscription.id,
        name: subscription.name,
        stage: "CANDIDATE",
        statusLabel: "未判断",
        monthlyAmount: Math.max(0, subscription.candidateMonthlySaving),
        nextAction: "根拠を確認して今月の更新判断を記録する",
        attentionReason: null,
        occurredAt: null,
      });
    }
  }

  for (const subscription of completedSubscriptions) {
    if (subscription.cancellationCompletedAt > referenceDate) continue;
    items.push({
      id: subscription.id,
      name: subscription.name,
      stage: "REALIZED",
      statusLabel: "解約完了",
      monthlyAmount: Math.max(0, subscription.monthlyCost),
      nextAction: "削減実績に反映済み",
      attentionReason: null,
      occurredAt: subscription.cancellationCompletedAt,
    });
  }

  const stageOrder: Record<ReviewOutcomeStage, number> = {
    IN_PROGRESS: 0,
    DECIDED: 1,
    CANDIDATE: 2,
    REALIZED: 3,
  };
  items.sort((left, right) =>
    Number(Boolean(right.attentionReason)) - Number(Boolean(left.attentionReason))
    || stageOrder[left.stage] - stageOrder[right.stage]
    || right.monthlyAmount - left.monthlyAmount
    || left.name.localeCompare(right.name, "ja"),
  );

  const stages = (["CANDIDATE", "DECIDED", "IN_PROGRESS", "REALIZED"] as const).map((stage) => ({
    stage,
    ...stageMeta[stage],
    count: items.filter((item) => item.stage === stage).length,
    monthlyAmount: items
      .filter((item) => item.stage === stage)
      .reduce((sum, item) => sum + item.monthlyAmount, 0),
  }));

  return {
    items,
    stages,
    attentionCount: items.filter((item) => item.attentionReason).length,
    realizedMonthlyRunRate: stages.find((stage) => stage.stage === "REALIZED")?.monthlyAmount ?? 0,
  };
}
