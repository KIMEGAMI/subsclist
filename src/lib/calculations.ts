import type { BillingCycle, Category, PaymentMethod, Subscription } from "./types";

export const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const millisecondsPerDay = 24 * 60 * 60 * 1000;

export function monthlyAmount(price: number, billingCycle: BillingCycle, customCycleDays?: number) {
  if (billingCycle === "monthly") return price;
  if (billingCycle === "yearly") return price / 12;
  if (billingCycle === "weekly") return (price * 52) / 12;
  const cycleDays = Math.max(customCycleDays ?? 30, 1);
  return (price * 30) / cycleDays;
}

export function annualAmount(price: number, billingCycle: BillingCycle, customCycleDays?: number) {
  return monthlyAmount(price, billingCycle, customCycleDays) * 12;
}

export function daysUntil(date: string) {
  const target = new Date(`${date}T00:00:00`);
  const today = new Date();
  const diff = Math.ceil((target.getTime() - today.getTime()) / millisecondsPerDay);
  return Number.isFinite(diff) ? diff : 0;
}

export function activeSubscriptions(subscriptions: Subscription[]) {
  return subscriptions.filter((item) => !item.deletedAt && item.status === "active");
}

type TotalsItem = {
  id: string;
  name: string;
  total: number;
  count: number;
  color: string;
};

function sortTotals(items: TotalsItem[]) {
  return items.sort((a, b) => b.total - a.total || b.count - a.count || a.name.localeCompare(b.name, "ja"));
}

export function dashboardTotals(subscriptions: Subscription[]) {
  const active = activeSubscriptions(subscriptions);
  const today = new Date();
  const renewalsThisMonth = active.filter((item) => {
    const date = new Date(`${item.nextBillingDate}T00:00:00`);
    return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
  }).length;

  return {
    monthly: active.reduce((sum, item) => sum + monthlyAmount(item.price, item.billingCycle, item.customCycleDays), 0),
    annual: active.reduce((sum, item) => sum + annualAmount(item.price, item.billingCycle, item.customCycleDays), 0),
    activeCount: active.length,
    renewalsThisMonth,
  };
}

export function groupByCategory(subscriptions: Subscription[], categories: Category[]) {
  const totals = new Map<string, TotalsItem>();
  const categoryLookup = new Map(categories.map((item) => [item.id, item] as const));

  for (const subscription of activeSubscriptions(subscriptions)) {
    const categoryId = subscription.categoryId ?? "uncategorized";
    const category = categoryLookup.get(categoryId);
    const existing = totals.get(categoryId) ?? {
      id: categoryId,
      name: category?.name ?? "未分類",
      total: 0,
      count: 0,
      color: category?.color ?? "#64748b",
    };
    existing.total += monthlyAmount(subscription.price, subscription.billingCycle, subscription.customCycleDays);
    existing.count += 1;
    totals.set(categoryId, existing);
  }

  return sortTotals([...totals.values()]);
}

export function groupByPayment(subscriptions: Subscription[], paymentMethods: PaymentMethod[]) {
  const totals = new Map<string, TotalsItem>();
  const paymentLookup = new Map(paymentMethods.map((item) => [item.id, item] as const));

  for (const subscription of activeSubscriptions(subscriptions)) {
    const paymentMethodId = subscription.paymentMethodId ?? "unassigned";
    const paymentMethod = paymentLookup.get(paymentMethodId);
    const existing = totals.get(paymentMethodId) ?? {
      id: paymentMethodId,
      name: paymentMethod?.name ?? "未設定",
      total: 0,
      count: 0,
      color: "#2563eb",
    };
    existing.total += monthlyAmount(subscription.price, subscription.billingCycle, subscription.customCycleDays);
    existing.count += 1;
    totals.set(paymentMethodId, existing);
  }

  return sortTotals([...totals.values()]);
}

function subscriptionScore(subscription: Subscription) {
  const monthly = monthlyAmount(subscription.price, subscription.billingCycle, subscription.customCycleDays);
  let score = 0;

  if (monthly >= 3000) score += 24;
  else if (monthly >= 1500) score += 14;

  if (subscription.usageFrequency === "low") score += 28;
  if (subscription.usageFrequency === "medium") score += 10;

  const ageDays = daysUntil(subscription.createdAt) * -1;
  if (ageDays >= 90) score += 12;
  if (daysUntil(subscription.nextBillingDate) <= 14) score += 8;
  if (subscription.status === "paused") score += 8;

  return score;
}

export function reviewCandidates(subscriptions: Subscription[], _categories: Category[]) {
  return activeSubscriptions(subscriptions)
    .map((item) => ({ item, score: subscriptionScore(item) }))
    .filter((entry) => entry.score >= 18)
    .sort((a, b) => b.score - a.score || a.item.nextBillingDate.localeCompare(b.item.nextBillingDate))
    .map((entry) => entry.item);
}

function escapeCsv(value: string) {
  return `"${value.replaceAll("\"", '""')}"`;
}

export function toCsv(subscriptions: Subscription[], categories: Category[], paymentMethods: PaymentMethod[]) {
  const categoryLookup = new Map(categories.map((item) => [item.id, item.name] as const));
  const paymentLookup = new Map(paymentMethods.map((item) => [item.id, item.name] as const));
  const rows = [
    ["サービス名", "金額", "請求周期", "月額換算", "年額換算", "次回更新日", "カテゴリ", "支払い方法", "ステータス", "メモ"],
    ...subscriptions
      .filter((item) => !item.deletedAt)
      .map((item) => {
        const monthly = monthlyAmount(item.price, item.billingCycle, item.customCycleDays);
        return [
          item.name,
          String(item.price),
          item.billingCycle,
          String(Math.round(monthly)),
          String(Math.round(annualAmount(item.price, item.billingCycle, item.customCycleDays))),
          item.nextBillingDate,
          categoryLookup.get(item.categoryId ?? "") ?? "未分類",
          paymentLookup.get(item.paymentMethodId ?? "") ?? "未設定",
          item.status,
          item.memo ?? "",
        ];
      }),
  ];

  return rows.map((row) => row.map((value) => escapeCsv(String(value))).join(",")).join("\n");
}
