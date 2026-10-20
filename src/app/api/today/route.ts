import { NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { billingOccurrencesInRange, nextBillingOccurrence } from "@/lib/billing";
import { japanCalendarDate } from "@/lib/subscription-usage";
import { isPremiumPlan, limitByPlan } from "@/lib/plans";
import { buildTodayActions, summarizeToday, type TodaySubscription } from "@/lib/today";
import { rankNews } from "@/lib/news-ranking";
import { prisma } from "@/lib/prisma";

function monthBounds(now: Date) {
  const today = japanCalendarDate(now);
  return {
    start: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)),
    end: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)),
  };
}

export async function GET() {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  const now = new Date();
  const { start, end } = monthBounds(now);
  const [allSubscriptions, usageRecords, paidThisMonth, savingsThisMonth, savingsAllTime, priceChanges, news] = await Promise.all([
    prisma.subscription.findMany({
      where: { userId: user.id, deletedAt: null, status: "ACTIVE" },
      select: { id: true, name: true, price: true, billingCycle: true, customCycleDays: true, nextBillingDate: true, trialEndsAt: true, cancellationDeadline: true },
      orderBy: { nextBillingDate: "asc" },
    }),
    prisma.subscriptionUsage.findMany({
      where: { userId: user.id, usedDate: { gte: new Date(now.getTime() - 31 * 86_400_000) } },
      select: { subscriptionId: true, usedDate: true },
    }),
    prisma.paymentHistory.aggregate({ where: { userId: user.id, paidAt: { gte: start, lt: end } }, _sum: { amount: true } }),
    prisma.savingsEvent.aggregate({ where: { userId: user.id, confirmedAt: { gte: start, lt: end } }, _sum: { monthlySaving: true } }),
    prisma.savingsEvent.aggregate({ where: { userId: user.id }, _sum: { monthlySaving: true } }),
    prisma.servicePriceChange.findMany({
      where: { service: { subscriptions: { some: { userId: user.id, status: "ACTIVE", deletedAt: null } } } },
      orderBy: { createdAt: "desc" }, take: 5,
      select: { id: true, planName: true, oldAmount: true, newAmount: true, changeAmount: true, currency: true, createdAt: true, service: { select: { id: true, name: true } } },
    }),
    prisma.newsItem.findMany({
      where: { service: { subscriptions: { some: { userId: user.id, status: "ACTIVE", deletedAt: null } } }, trustLevel: { in: ["OFFICIAL", "VERIFIED"] } },
      orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }], take: 30,
      select: { id: true, title: true, summaryBase: true, sourceUrl: true, publishedAt: true, category: true, importance: true, service: { select: { id: true, name: true, subscriptions: { where: { userId: user.id, status: "ACTIVE", deletedAt: null }, select: { id: true } } } } },
    }),
  ]);
  const visibleSubscriptions = limitByPlan(allSubscriptions, user.plan);
  const usageBySubscription = new Map<string, Date[]>();
  for (const usage of usageRecords) usageBySubscription.set(usage.subscriptionId, [...(usageBySubscription.get(usage.subscriptionId) ?? []), usage.usedDate]);
  const subscriptions: TodaySubscription[] = visibleSubscriptions.map((subscription) => ({ ...subscription, usageDates: usageBySubscription.get(subscription.id) ?? [] }));
  const summary = summarizeToday(subscriptions, paidThisMonth._sum.amount ?? 0, now);
  const actions = buildTodayActions(subscriptions, now, priceChanges.map((change) => ({
    id: change.id,
    serviceId: change.service.id,
    serviceName: change.service.name,
    planName: change.planName,
    oldAmount: change.oldAmount,
    newAmount: change.newAmount,
    changeAmount: change.changeAmount,
    currency: change.currency,
  })));
  const today = japanCalendarDate(now);
  const plannedCount = subscriptions.flatMap((subscription) => billingOccurrencesInRange(subscription.nextBillingDate, subscription.billingCycle, subscription.customCycleDays, start, end)).filter((date) => date >= today).length;
  const renewals = subscriptions.map((subscription) => ({ id: subscription.id, name: subscription.name, nextBillingDate: nextBillingOccurrence(subscription.nextBillingDate, subscription.billingCycle, subscription.customCycleDays, now).toISOString() })).slice(0, 10);
  return NextResponse.json({
    summary: { ...summary, plannedCount, savingsThisMonth: savingsThisMonth._sum.monthlySaving ?? 0, savingsAllTime: savingsAllTime._sum.monthlySaving ?? 0 },
    actions,
    renewals,
    priceChanges: priceChanges.map((change) => ({ ...change, createdAt: change.createdAt.toISOString() })),
    news: news.map((item) => {
      if (!item.service) return null;
      return {
      id: item.id,
      title: item.title,
      summary: item.summaryBase,
      sourceUrl: item.sourceUrl,
      publishedAt: item.publishedAt?.toISOString() ?? null,
      score: rankNews({ category: item.category, importance: item.importance, publishedAt: item.publishedAt, contracted: item.service.subscriptions.length > 0, now }),
      service: { id: item.service.id, name: item.service.name },
      reasons: ["契約中のサブスク"],
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null).sort((left, right) => right.score - left.score || (right.publishedAt ?? "").localeCompare(left.publishedAt ?? "")).slice(0, 5),
    plan: { name: isPremiumPlan(user.plan) ? "PREMIUM" : "FREE", premium: isPremiumPlan(user.plan) },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
