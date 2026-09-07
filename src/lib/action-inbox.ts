import { daysUntil } from "./billing.ts";
import type {
  BillingReconciliationItem,
  BillingReconciliationPayment,
} from "./billing-reconciliation.ts";
import { paymentOrganizationMissing, type PaymentOrganizationRecord } from "./payment-organization.ts";
import { japanCalendarDate } from "./subscription-usage.ts";

export const ACTION_INBOX_DISPLAY_LIMIT = 8;
export const ACTION_INBOX_MONTHLY_CLOSE_START_DAY = 20;

const ACTION_WINDOW_DAYS = 7;
const RENEWAL_WINDOW_DAYS = 30;
const PRIORITY_URGENT_SCORE = 85;
const PRIORITY_IMPORTANT_SCORE = 60;

const scores = {
  cancellationDeadline: 100,
  trialEnd: 95,
  paymentAmountMismatch: 92,
  paymentDue: 90,
  paymentUnmatched: 85,
  renewalDecision: 75,
  paymentOrganization: 65,
  budget: 60,
  monthlyClose: 55,
  weeklyReview: 45,
} as const;

export type ActionInboxTaskType =
  | "CANCELLATION_DEADLINE"
  | "TRIAL_END"
  | "PAYMENT_DUE"
  | "PAYMENT_AMOUNT_MISMATCH"
  | "PAYMENT_UNCONFIRMED"
  | "PAYMENT_UNMATCHED"
  | "RENEWAL_DECISION"
  | "PAYMENT_ORGANIZATION"
  | "BUDGET"
  | "MONTHLY_CLOSE"
  | "WEEKLY_REVIEW";

export type ActionInboxTask = {
  id: string;
  type: ActionInboxTaskType;
  priority: "URGENT" | "IMPORTANT" | "ROUTINE";
  score: number;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  subscriptionId: string | null;
  dueAt: Date | null;
};

export type ActionInboxSubscription = {
  id: string;
  name: string;
  nextBillingDate: Date;
  trialEndsAt: Date | null;
  cancellationDeadline: Date | null;
  paymentRecordedForCycle: boolean;
  renewalDecisionRecorded: boolean;
  weeklyReviewNeeded: boolean;
};

export type ActionInboxPayment = PaymentOrganizationRecord & {
  id: string;
  subscriptionId: string;
  subscriptionName: string;
  paidAt: Date;
};

export type ActionInboxReconciliation = {
  items: BillingReconciliationItem[];
  unmatchedPayments: Array<BillingReconciliationPayment & {
    subscriptionName: string;
  }>;
};

export type BuildActionInboxInput = {
  subscriptions: ActionInboxSubscription[];
  payments: ActionInboxPayment[];
  monthlyCloseCompleted: boolean;
  budgetExceeded: boolean;
  premium: boolean;
  reconciliation?: ActionInboxReconciliation;
  now?: Date;
};

function isWithin(days: number, maximum: number) {
  return days >= 0 && days <= maximum;
}

function taskPriority(score: number): ActionInboxTask["priority"] {
  if (score >= PRIORITY_URGENT_SCORE) return "URGENT";
  if (score >= PRIORITY_IMPORTANT_SCORE) return "IMPORTANT";
  return "ROUTINE";
}

function task(input: Omit<ActionInboxTask, "priority">): ActionInboxTask {
  return { ...input, priority: taskPriority(input.score) };
}

function subscriptionTask(
  subscription: ActionInboxSubscription,
  now: Date,
  premium: boolean,
  hasDetailedReconciliation: boolean,
) {
  const candidates: ActionInboxTask[] = [];
  const cancellationDays = subscription.cancellationDeadline
    ? daysUntil(subscription.cancellationDeadline, now)
    : Number.POSITIVE_INFINITY;
  const trialDays = subscription.trialEndsAt
    ? daysUntil(subscription.trialEndsAt, now)
    : Number.POSITIVE_INFINITY;
  const renewalDays = daysUntil(subscription.nextBillingDate, now);

  if (subscription.cancellationDeadline && isWithin(cancellationDays, ACTION_WINDOW_DAYS)) {
    candidates.push(task({
      id: `cancellation:${subscription.id}`,
      type: "CANCELLATION_DEADLINE",
      score: scores.cancellationDeadline - cancellationDays,
      title: `${subscription.name}の解約期限を確認`,
      detail: cancellationDays === 0 ? "解約期限は今日です。" : `解約期限まで${cancellationDays}日です。`,
      href: `/subscriptions/${subscription.id}`,
      actionLabel: "解約手順を確認",
      subscriptionId: subscription.id,
      dueAt: subscription.cancellationDeadline,
    }));
  }
  if (subscription.trialEndsAt && isWithin(trialDays, ACTION_WINDOW_DAYS)) {
    candidates.push(task({
      id: `trial:${subscription.id}`,
      type: "TRIAL_END",
      score: scores.trialEnd - trialDays,
      title: `${subscription.name}の無料トライアルを判断`,
      detail: trialDays === 0 ? "無料トライアルは今日終了します。" : `無料トライアル終了まで${trialDays}日です。`,
      href: `/subscriptions/${subscription.id}`,
      actionLabel: "契約を確認",
      subscriptionId: subscription.id,
      dueAt: subscription.trialEndsAt,
    }));
  }
  if (!hasDetailedReconciliation && renewalDays === 0 && !subscription.paymentRecordedForCycle) {
    candidates.push(task({
      id: `payment:${subscription.id}`,
      type: "PAYMENT_DUE",
      score: scores.paymentDue,
      title: `${subscription.name}の支払いを確認`,
      detail: "更新日は今日です。請求を確認したら支払い履歴を残してください。",
      href: "/payments",
      actionLabel: "支払いを記録",
      subscriptionId: subscription.id,
      dueAt: subscription.nextBillingDate,
    }));
  }
  if (premium && isWithin(renewalDays, RENEWAL_WINDOW_DAYS) && !subscription.renewalDecisionRecorded) {
    candidates.push(task({
      id: `renewal:${subscription.id}`,
      type: "RENEWAL_DECISION",
      score: scores.renewalDecision - Math.min(renewalDays, RENEWAL_WINDOW_DAYS),
      title: `${subscription.name}の更新判断を残す`,
      detail: renewalDays === 0 ? "更新日は今日です。継続理由または再検討条件を残してください。" : `更新まで${renewalDays}日です。`,
      href: `/subscriptions/${subscription.id}`,
      actionLabel: "判断を記録",
      subscriptionId: subscription.id,
      dueAt: subscription.nextBillingDate,
    }));
  }

  if (candidates.length > 0) {
    return candidates.sort((left, right) => right.score - left.score)[0];
  }
  if (subscription.weeklyReviewNeeded) {
    return task({
      id: `weekly:${subscription.id}`,
      type: "WEEKLY_REVIEW",
      score: scores.weeklyReview,
      title: `${subscription.name}の今週の利用を確認`,
      detail: "今週使った日数を残すと、継続判断の精度が上がります。",
      href: `/subscriptions/${subscription.id}`,
      actionLabel: "利用状況を記録",
      subscriptionId: subscription.id,
      dueAt: null,
    });
  }
  return null;
}

function yen(value: number) {
  return `${value.toLocaleString("ja-JP")}円`;
}

function reconciliationTasks(
  reconciliation: ActionInboxReconciliation,
  now: Date,
) {
  const tasks: ActionInboxTask[] = [];
  for (const item of reconciliation.items) {
    if (item.status === "AMOUNT_MISMATCH") {
      const difference = item.difference ?? 0;
      tasks.push(task({
        id: `billing-mismatch:${item.id}`,
        type: "PAYMENT_AMOUNT_MISMATCH",
        score: scores.paymentAmountMismatch,
        title: `${item.subscriptionName}の請求額を確認`,
        detail: `予定 ${yen(item.expectedAmount)} / 実績 ${yen(item.paidAmount ?? 0)} / 差額 ${difference >= 0 ? "+" : ""}${yen(difference)}`,
        href: "/payments#payment-history-list",
        actionLabel: "差異を確認",
        subscriptionId: item.subscriptionId,
        dueAt: item.occurrenceAt,
      }));
      continue;
    }
    if (item.status !== "UNCONFIRMED") continue;
    const overdueDays = Math.max(0, -daysUntil(item.occurrenceAt, now));
    tasks.push(task({
      id: `billing-unconfirmed:${item.id}`,
      type: "PAYMENT_UNCONFIRMED",
      score: Math.min(scores.cancellationDeadline - 1, scores.paymentDue + overdueDays),
      title: `${item.subscriptionName}の支払いを確認`,
      detail: overdueDays === 0
        ? `請求予定日は今日です。予定額は${yen(item.expectedAmount)}です。`
        : `請求予定日を${overdueDays}日過ぎています。予定額は${yen(item.expectedAmount)}です。`,
      href: "/payments#payment-history-list",
      actionLabel: "支払いを確認",
      subscriptionId: item.subscriptionId,
      dueAt: item.occurrenceAt,
    }));
  }
  for (const payment of reconciliation.unmatchedPayments) {
    tasks.push(task({
      id: `billing-unmatched:${payment.id}`,
      type: "PAYMENT_UNMATCHED",
      score: scores.paymentUnmatched,
      title: `${payment.subscriptionName}の支払いを照合`,
      detail: `${payment.paidAt.toISOString().slice(0, 10)}の${yen(payment.amount)}が、今月の請求予定と結び付いていません。`,
      href: "/monthly-report",
      actionLabel: "突合を確認",
      subscriptionId: payment.subscriptionId,
      dueAt: payment.paidAt,
    }));
  }
  return tasks;
}

export function buildActionInbox(input: BuildActionInboxInput): ActionInboxTask[] {
  const now = input.now ?? new Date();
  const hasDetailedReconciliation = input.premium && input.reconciliation !== undefined;
  const tasks = input.subscriptions
    .map((subscription) => subscriptionTask(
      subscription,
      now,
      input.premium,
      hasDetailedReconciliation,
    ))
    .filter((item): item is ActionInboxTask => item !== null);

  if (hasDetailedReconciliation && input.reconciliation) {
    tasks.push(...reconciliationTasks(input.reconciliation, now));
  }

  for (const payment of input.payments) {
    const missing = paymentOrganizationMissing(payment);
    if (missing.length === 0) continue;
    tasks.push(task({
      id: `organization:${payment.id}`,
      type: "PAYMENT_ORGANIZATION",
      score: scores.paymentOrganization,
      title: `${payment.subscriptionName}の支払いを整理`,
      detail: `不足: ${missing.join("・")} / 支払日 ${payment.paidAt.toISOString().slice(0, 10)}`,
      href: "/payments#payment-history-list",
      actionLabel: "記録を修正",
      subscriptionId: payment.subscriptionId,
      dueAt: null,
    }));
  }

  if (input.budgetExceeded) {
    tasks.push(task({
      id: "budget",
      type: "BUDGET",
      score: scores.budget,
      title: "月額予算の超過を見直す",
      detail: "削減候補を比較し、継続・解約の判断を残してください。",
      href: "/review",
      actionLabel: "削減候補を見る",
      subscriptionId: null,
      dueAt: null,
    }));
  }

  const currentDay = japanCalendarDate(now).getUTCDate();
  if (input.premium && !input.monthlyCloseCompleted && currentDay >= ACTION_INBOX_MONTHLY_CLOSE_START_DAY) {
    tasks.push(task({
      id: "monthly-close",
      type: "MONTHLY_CLOSE",
      score: scores.monthlyClose,
      title: "今月の月次締めを完了する",
      detail: "支払い・見直し・期限リスクを確認して今月の状態を保存します。",
      href: "/monthly-report",
      actionLabel: "月次締めを確認",
      subscriptionId: null,
      dueAt: null,
    }));
  }

  return tasks.sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score;
    const leftDue = left.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const rightDue = right.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
    return leftDue - rightDue || left.title.localeCompare(right.title, "ja");
  });
}
