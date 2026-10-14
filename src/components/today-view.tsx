import Link from "next/link";
import { AppShell, Card, PageHeader } from "@/components/app-shell";
import { DailyUsageCheckButtons } from "@/components/real-forms";
import { requireVerifiedUser } from "@/lib/auth";
import { billingOccurrencesInRange, isoDate, nextBillingOccurrence } from "@/lib/billing";
import { japanCalendarDate } from "@/lib/subscription-usage";
import { prisma } from "@/lib/prisma";
import { isPremiumPlan, limitByPlan } from "@/lib/plans";
import { buildTodayActions, summarizeToday, type TodaySubscription } from "@/lib/today";

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

function monthBounds(now: Date) {
  const today = japanCalendarDate(now);
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  return { start, end };
}

function actionTone(type: ReturnType<typeof buildTodayActions>[number]["type"]) {
  if (type === "CANCELLATION_DEADLINE" || type === "TRIAL_END") return "border-rose-200 bg-rose-50";
  if (type === "BILLING_DUE") return "border-amber-200 bg-amber-50";
  if (type === "LOW_USAGE") return "border-violet-200 bg-violet-50";
  if (type === "PRICE_CHANGE_REVIEW") return "border-rose-200 bg-rose-50";
  return "border-blue-200 bg-blue-50";
}

export async function TodayView() {
  const user = await requireVerifiedUser();
  const now = new Date();
  const { start, end } = monthBounds(now);
  const [allSubscriptions, usageRecords, paidThisMonth, savingsThisMonth, savingsAllTime, recentPriceChanges] = await Promise.all([
    prisma.subscription.findMany({
      where: { userId: user.id, deletedAt: null, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        price: true,
        billingCycle: true,
        customCycleDays: true,
        nextBillingDate: true,
        trialEndsAt: true,
        cancellationDeadline: true,
      },
      orderBy: { nextBillingDate: "asc" },
    }),
    prisma.subscriptionUsage.findMany({
      where: { userId: user.id, usedDate: { gte: new Date(now.getTime() - 31 * 86_400_000) } },
      select: { subscriptionId: true, usedDate: true },
    }),
    prisma.paymentHistory.aggregate({
      where: { userId: user.id, paidAt: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    prisma.savingsEvent.aggregate({ where: { userId: user.id, confirmedAt: { gte: start, lt: end } }, _sum: { monthlySaving: true } }),
    prisma.savingsEvent.aggregate({ where: { userId: user.id }, _sum: { monthlySaving: true } }),
    prisma.servicePriceChange.findMany({ where: { service: { subscriptions: { some: { userId: user.id, status: "ACTIVE", deletedAt: null } } } }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, planName: true, oldAmount: true, newAmount: true, changeAmount: true, currency: true, createdAt: true, service: { select: { id: true, name: true } } } }),
  ]);
  const visibleSubscriptions = limitByPlan(allSubscriptions, user.plan);
  const usageBySubscription = new Map<string, Date[]>();
  for (const usage of usageRecords) {
    const dates = usageBySubscription.get(usage.subscriptionId) ?? [];
    dates.push(usage.usedDate);
    usageBySubscription.set(usage.subscriptionId, dates);
  }
  const subscriptions: TodaySubscription[] = visibleSubscriptions.map((subscription) => ({
    ...subscription,
    usageDates: usageBySubscription.get(subscription.id) ?? [],
  }));
  const summary = summarizeToday(subscriptions, paidThisMonth._sum.amount ?? 0, now);
  const actions = buildTodayActions(subscriptions, now, recentPriceChanges.map((change) => ({
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
  const usageCandidates = subscriptions
    .filter((subscription) => !(usageBySubscription.get(subscription.id) ?? []).some((date) => japanCalendarDate(date).getTime() === today.getTime()))
    .map((subscription) => ({
      subscription,
      nextBillingDate: nextBillingOccurrence(subscription.nextBillingDate, subscription.billingCycle, subscription.customCycleDays, now),
    }))
    .sort((left, right) => left.nextBillingDate.getTime() - right.nextBillingDate.getTime())
    .slice(0, 3);
  const scheduledThisMonth = subscriptions.flatMap((subscription) => billingOccurrencesInRange(
    subscription.nextBillingDate,
    subscription.billingCycle,
    subscription.customCycleDays,
    start,
    end,
  ).map((date) => ({ subscription, date }))).filter((item) => item.date >= today).length;

  return (
    <AppShell>
      <PageHeader
        title="Today"
        description="今日確認すべき契約だけを、短時間で確認できます。"
        action={<Link href="/dashboard" className="btn-secondary">ダッシュボード</Link>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["今日の請求", summary.dueTodayCount > 0 ? `${summary.dueTodayCount}件 / ${yen.format(summary.dueTodayAmount)}` : "なし"],
          ["7日以内の更新", `${summary.renewalWithinWeekCount}件`],
          ["期限の確認", `${summary.deadlineWithinWeekCount}件`],
          ["今月の支払済", yen.format(summary.monthPaidAmount)],
          ["今月の予定", `${yen.format(summary.monthPlannedAmount)} / ${scheduledThisMonth}件`],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-xs font-black text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-black text-slate-950">{value}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">今日やること</h2>
            <p className="mt-1 text-sm text-slate-600">優先度の高いものから最大3件だけ表示します。</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">{actions.length}件</span>
        </div>
        {actions.length === 0 ? (
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
            <p className="font-black">今日の確認は完了です。</p>
            <p className="mt-1 text-sm">今日の請求・期限・緊急の見直しはありません。</p>
          </div>
        ) : (
          <div className="mt-5 grid gap-3">
            {actions.map((action, index) => (
              <article key={action.id} className={`rounded-lg border p-4 ${actionTone(action.type)}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-black text-slate-500">{index + 1}. 今日のアクション</p>
                    <h3 className="mt-1 font-black text-slate-950">{action.title}</h3>
                    <p className="mt-1 text-sm text-slate-700">{action.detail}</p>
                  </div>
                  <Link href={action.href} className="btn-secondary shrink-0">詳しく見る</Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-black">契約中サービスの価格変更</h2><p className="mt-1 text-sm text-slate-600">契約中サービスについて確認できた価格変更です。</p></div><Link href="/subscription-news" className="btn-secondary">契約ニュースを見る</Link></div>
        {recentPriceChanges.length === 0 ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm font-semibold text-slate-600">契約中サービスの価格変更はありません。</p> : <div className="mt-4 divide-y divide-slate-100">{recentPriceChanges.map((change) => <div key={change.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-black">{change.service.name}</p><p className="text-xs font-bold text-slate-500">{change.planName}・{change.oldAmount.toLocaleString("ja-JP")} → {change.newAmount.toLocaleString("ja-JP")} {change.currency}</p></div><span className={`font-black ${change.changeAmount > 0 ? "text-rose-700" : "text-emerald-700"}`}>{change.changeAmount > 0 ? "+" : ""}{change.changeAmount.toLocaleString("ja-JP")} {change.currency}</span></div>)}</div>}
      </Card>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <h2 className="text-lg font-black">今日使いましたか？</h2>
          <p className="mt-1 text-sm text-slate-600">利用記録は更新判断と1回あたりコストの確認に使われます。</p>
          <div className="mt-4 grid gap-3">
            {usageCandidates.length === 0 ? (
              <p className="rounded-lg bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">今日の対象はすべて記録済みです。</p>
            ) : usageCandidates.map(({ subscription, nextBillingDate }) => (
              <div key={subscription.id} className="rounded-lg border border-slate-200 bg-white/75 p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <p className="font-black text-slate-950">{subscription.name}</p>
                    <p className="mt-1 text-sm text-slate-600">次回請求 {isoDate(nextBillingDate)} / {yen.format(subscription.price)}</p>
                  </div>
                  <DailyUsageCheckButtons id={subscription.id} compact />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-black">今月の固定費</h2>
          <dl className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3"><dt className="text-sm font-semibold text-slate-600">月額換算</dt><dd className="font-black text-slate-950">{yen.format(summary.monthlyEquivalent)}</dd></div>
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3"><dt className="text-sm font-semibold text-slate-600">今月の支払済</dt><dd className="font-black text-slate-950">{yen.format(summary.monthPaidAmount)}</dd></div>
            <div className="flex items-center justify-between gap-4"><dt className="text-sm font-semibold text-slate-600">今月の支払い予定</dt><dd className="font-black text-slate-950">{yen.format(summary.monthPlannedAmount)}</dd></div>
            <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3"><dt className="text-sm font-semibold text-slate-600">確定した月額削減</dt><dd className="font-black text-emerald-700">{yen.format(savingsThisMonth._sum.monthlySaving ?? 0)}</dd></div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-3"><Link href="/payments" className="btn-secondary">支払い履歴を見る</Link><Link href="/savings" className="btn-secondary">節約実績を見る</Link></div>
          <p className="mt-3 text-xs font-semibold text-slate-500">累計確定削減: {yen.format(savingsAllTime._sum.monthlySaving ?? 0)} / 月額換算</p>
          {!isPremiumPlan(user.plan) && <p className="mt-4 text-sm font-semibold text-blue-800">Premiumでは見直し・分析・解約支援を利用できます。</p>}
        </Card>
      </div>
    </AppShell>
  );
}
