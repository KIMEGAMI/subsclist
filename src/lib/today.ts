import {
  billingOccurrencesInRange,
  daysUntil,
  monthlyAmount,
  nextBillingOccurrence,
} from "./billing.ts";
import { japanCalendarDate } from "./subscription-usage.ts";

export const TODAY_ACTION_LIMIT = 3;
export const TODAY_RENEWAL_WINDOW_DAYS = 7;

export type TodaySubscription = {
  id: string;
  name: string;
  price: number;
  billingCycle: string;
  customCycleDays: number | null;
  nextBillingDate: Date;
  trialEndsAt: Date | null;
  cancellationDeadline: Date | null;
  usageDates: Date[];
};

export type TodayActionType =
  | "CANCELLATION_DEADLINE"
  | "TRIAL_END"
  | "BILLING_DUE"
  | "RENEWAL"
  | "LOW_USAGE"
  | "PRICE_CHANGE_REVIEW";

export type TodayPriceChange = {
  id: string;
  serviceId: string;
  serviceName: string;
  planName: string;
  oldAmount: number;
  newAmount: number;
  changeAmount: number;
  currency: string;
};

export type TodayAction = {
  id: string;
  subscriptionId: string | null;
  subscriptionName: string;
  type: TodayActionType;
  score: number;
  title: string;
  detail: string;
  href: string;
};

export type TodaySummary = {
  dueTodayCount: number;
  dueTodayAmount: number;
  renewalWithinWeekCount: number;
  deadlineWithinWeekCount: number;
  monthlyEquivalent: number;
  monthPaidAmount: number;
  monthPlannedAmount: number;
};

function startOfJapanMonth(now: Date) {
  const today = japanCalendarDate(now);
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
}

function startOfNextJapanMonth(now: Date) {
  const monthStart = startOfJapanMonth(now);
  return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
}

function isWithinWindow(date: Date | null, now: Date, days: number) {
  if (!date) return false;
  const remaining = daysUntil(date, now);
  return remaining >= 0 && remaining <= days;
}

function usageDaysInRecentWindow(dates: Date[], now: Date, days: number) {
  const today = japanCalendarDate(now);
  const windowStart = new Date(today);
  windowStart.setUTCDate(windowStart.getUTCDate() - (days - 1));
  return dates.filter((date) => {
    const usedAt = japanCalendarDate(date);
    return usedAt >= windowStart && usedAt <= today;
  }).length;
}

export function buildTodayActions(
  subscriptions: TodaySubscription[],
  now = new Date(),
  priceChanges: TodayPriceChange[] = [],
): TodayAction[] {
  const actions: TodayAction[] = [];

  for (const change of priceChanges) {
    actions.push({
      id: `price-change:${change.id}`,
      subscriptionId: null,
      subscriptionName: change.serviceName,
      type: "PRICE_CHANGE_REVIEW",
      score: change.changeAmount > 0 ? 75 : 65,
      title: `${change.serviceName}の価格変更を確認`,
      detail: `${change.planName}が${change.oldAmount.toLocaleString("ja-JP")}から${change.newAmount.toLocaleString("ja-JP")}${change.currency}に変更されました。`,
      href: "/subscription-news",
    });
  }

  for (const subscription of subscriptions) {
    const nextBillingDate = nextBillingOccurrence(
      subscription.nextBillingDate,
      subscription.billingCycle,
      subscription.customCycleDays,
      now,
    );
    const cancellationDays = subscription.cancellationDeadline
      ? daysUntil(subscription.cancellationDeadline, now)
      : null;
    const trialDays = subscription.trialEndsAt
      ? daysUntil(subscription.trialEndsAt, now)
      : null;
    const billingDays = daysUntil(nextBillingDate, now);
    const href = `/subscriptions/${subscription.id}`;

    if (cancellationDays !== null && isWithinWindow(subscription.cancellationDeadline, now, TODAY_RENEWAL_WINDOW_DAYS)) {
      actions.push({
        id: `cancellation:${subscription.id}`,
        subscriptionId: subscription.id,
        subscriptionName: subscription.name,
        type: "CANCELLATION_DEADLINE",
        score: 100 - cancellationDays,
        title: `${subscription.name}の解約期限を確認`,
        detail: cancellationDays === 0 ? "解約期限は今日です。" : `解約期限まで${cancellationDays}日です。`,
        href,
      });
      continue;
    }

    if (trialDays !== null && isWithinWindow(subscription.trialEndsAt, now, TODAY_RENEWAL_WINDOW_DAYS)) {
      actions.push({
        id: `trial:${subscription.id}`,
        subscriptionId: subscription.id,
        subscriptionName: subscription.name,
        type: "TRIAL_END",
        score: 90 - trialDays,
        title: `${subscription.name}の無料トライアルを判断`,
        detail: trialDays === 0 ? "無料トライアルは今日終了します。" : `無料トライアル終了まで${trialDays}日です。`,
        href,
      });
      continue;
    }

    if (billingDays === 0) {
      actions.push({
        id: `billing:${subscription.id}`,
        subscriptionId: subscription.id,
        subscriptionName: subscription.name,
        type: "BILLING_DUE",
        score: 80,
        title: `${subscription.name}の請求を確認`,
        detail: `今日は${subscription.price.toLocaleString("ja-JP")}円の請求予定日です。`,
        href,
      });
      continue;
    }

    if (billingDays > 0 && billingDays <= TODAY_RENEWAL_WINDOW_DAYS) {
      actions.push({
        id: `renewal:${subscription.id}`,
        subscriptionId: subscription.id,
        subscriptionName: subscription.name,
        type: "RENEWAL",
        score: 70 - billingDays,
        title: `${subscription.name}の更新を見直す`,
        detail: `次回請求まで${billingDays}日です。継続するか確認しましょう。`,
        href,
      });
      continue;
    }

    const usageDays30 = usageDaysInRecentWindow(subscription.usageDates, now, 30);
    if (usageDays30 === 0 && monthlyAmount(subscription.price, subscription.billingCycle, subscription.customCycleDays) > 0) {
      actions.push({
        id: `usage:${subscription.id}`,
        subscriptionId: subscription.id,
        subscriptionName: subscription.name,
        type: "LOW_USAGE",
        score: 40 + Math.min(20, Math.round(monthlyAmount(subscription.price, subscription.billingCycle, subscription.customCycleDays) / 500)),
        title: `${subscription.name}の利用状況を記録`,
        detail: "過去30日間の利用記録がありません。使っていれば記録を残しましょう。",
        href,
      });
    }
  }

  return actions
    .sort((left, right) => right.score - left.score || left.subscriptionName.localeCompare(right.subscriptionName, "ja"))
    .slice(0, TODAY_ACTION_LIMIT);
}

export function summarizeToday(
  subscriptions: TodaySubscription[],
  monthPaidAmount: number,
  now = new Date(),
): TodaySummary {
  const monthStart = startOfJapanMonth(now);
  const nextMonthStart = startOfNextJapanMonth(now);
  const today = japanCalendarDate(now);
  let dueTodayCount = 0;
  let dueTodayAmount = 0;
  let renewalWithinWeekCount = 0;
  let deadlineWithinWeekCount = 0;
  let monthlyEquivalent = 0;
  let monthPlannedAmount = 0;

  for (const subscription of subscriptions) {
    const occurrence = nextBillingOccurrence(
      subscription.nextBillingDate,
      subscription.billingCycle,
      subscription.customCycleDays,
      now,
    );
    const billingDays = daysUntil(occurrence, now);
    if (billingDays === 0) {
      dueTodayCount += 1;
      dueTodayAmount += subscription.price;
    }
    if (billingDays >= 0 && billingDays <= TODAY_RENEWAL_WINDOW_DAYS) renewalWithinWeekCount += 1;
    if (
      isWithinWindow(subscription.trialEndsAt, now, TODAY_RENEWAL_WINDOW_DAYS)
      || isWithinWindow(subscription.cancellationDeadline, now, TODAY_RENEWAL_WINDOW_DAYS)
    ) {
      deadlineWithinWeekCount += 1;
    }
    monthlyEquivalent += monthlyAmount(subscription.price, subscription.billingCycle, subscription.customCycleDays);
    monthPlannedAmount += billingOccurrencesInRange(
      subscription.nextBillingDate,
      subscription.billingCycle,
      subscription.customCycleDays,
      monthStart,
      nextMonthStart,
    )
      .filter((date) => date >= today)
      .reduce((sum) => sum + subscription.price, 0);
  }

  return {
    dueTodayCount,
    dueTodayAmount,
    renewalWithinWeekCount,
    deadlineWithinWeekCount,
    monthlyEquivalent: Math.round(monthlyEquivalent),
    monthPaidAmount,
    monthPlannedAmount,
  };
}
