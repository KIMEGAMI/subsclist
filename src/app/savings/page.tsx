import Link from "next/link";
import type { Metadata } from "next";
import { AppShell, Card, PageHeader } from "@/components/app-shell";
import { SavingsEventForm } from "@/components/savings-event-form";
import { requireVerifiedUser } from "@/lib/auth";
import { isPremiumPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { japanCalendarDate } from "@/lib/subscription-usage";
import { recentJapanMonthIntervals } from "@/lib/subscription-savings";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const typeLabels: Record<string, string> = { CANCELLED: "解約", PLAN_DOWNGRADE: "プラン変更", SWITCHED: "乗り換え", PRICE_RENEGOTIATED: "料金交渉" };
const dateFormatter = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" });

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SavingsPage() {
  const user = await requireVerifiedUser();
  if (!isPremiumPlan(user.plan)) {
    return <AppShell><PageHeader title="節約実績" description="実行済みの解約・変更・乗り換えによる削減額を記録します。" /><Card className="border-blue-200 bg-blue-50/90"><p className="text-sm font-black text-blue-700">Premium限定</p><h2 className="mt-2 text-xl font-black text-blue-950">節約実績の記録・集計</h2><p className="mt-3 text-sm font-semibold leading-6 text-blue-900">実際に完了した変更による削減額の記録、月別集計、履歴の確認はPremiumで利用できます。</p><Link href="/billing" className="btn-primary mt-5 inline-flex">プランを確認</Link></Card></AppShell>;
  }
  const now = new Date();
  const japanToday = japanCalendarDate(now);
  const currentYear = japanToday.getUTCFullYear();
  const currentMonth = japanToday.getUTCMonth() + 1;
  const chartMonths = recentJapanMonthIntervals(now);
  const [events, subscriptions, lifetimeAggregate, monthAggregates] = await Promise.all([
    prisma.savingsEvent.findMany({ where: { userId: user.id }, orderBy: { confirmedAt: "desc" }, take: 100, select: { id: true, type: true, monthlySaving: true, annualSaving: true, confirmedAt: true, note: true, subscription: { select: { name: true } } } }),
    prisma.subscription.findMany({ where: { userId: user.id, status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.savingsEvent.aggregate({ where: { userId: user.id }, _sum: { monthlySaving: true } }),
    Promise.all(chartMonths.map((month) => prisma.savingsEvent.aggregate({
      where: { userId: user.id, confirmedAt: { gte: month.start, lt: month.end } },
      _sum: { monthlySaving: true },
    }))),
  ]);
  const monthlySavings = chartMonths.map((month, index) => ({
    key: `${month.year}-${String(month.month).padStart(2, "0")}`,
    label: `${month.month}月`,
    value: monthAggregates[index]?._sum.monthlySaving ?? 0,
  }));
  const monthSaving = monthlySavings.find((month) => month.key === `${currentYear}-${String(currentMonth).padStart(2, "0")}`)?.value ?? 0;
  const yearSaving = monthlySavings.filter((month) => month.key.startsWith(`${currentYear}-`)).reduce((sum, month) => sum + month.value, 0);
  const lifetimeSaving = lifetimeAggregate._sum.monthlySaving ?? 0;
  const maxMonthlySaving = Math.max(...monthlySavings.map((item) => item.value), 1);
  const exportAction = isPremiumPlan(user.plan)
    ? <Link href="/api/export/savings-events" className="btn-secondary">CSVをダウンロード</Link>
    : <Link href="/settings" className="btn-secondary">PremiumでCSV出力</Link>;
  return <AppShell><PageHeader title="節約実績" description="実行済みの解約・変更・乗り換えによる削減額を記録します。提案段階の試算は含めません。" action={exportAction} /><div className="grid gap-4 md:grid-cols-3"><Card><p className="text-sm font-bold text-slate-500">今月</p><p className="mt-2 text-3xl font-black text-emerald-700">{yen.format(monthSaving)}</p></Card><Card><p className="text-sm font-bold text-slate-500">今年</p><p className="mt-2 text-3xl font-black">{yen.format(yearSaving)}</p></Card><Card><p className="text-sm font-bold text-slate-500">利用開始から</p><p className="mt-2 text-3xl font-black">{yen.format(lifetimeSaving)}</p></Card></div><Card className="mt-5"><h2 className="text-lg font-black">月別削減額</h2><p className="mt-1 text-sm text-slate-600">確定したSavings Eventだけを過去12か月で集計しています。</p><div className="mt-6 grid h-48 grid-cols-12 items-end gap-2">{monthlySavings.map((item) => <div key={item.key} className="flex h-full flex-col items-center justify-end gap-2"><div className="w-full min-w-3 rounded-t-md bg-emerald-500" style={{ height: `${Math.max(item.value / maxMonthlySaving * 100, item.value > 0 ? 8 : 0)}%` }} title={`${item.key}: ${yen.format(item.value)}`} /><span className="text-[11px] font-bold text-slate-500">{item.label}</span></div>)}</div></Card><div className="mt-5 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]"><Card><h2 className="text-lg font-black">実績を確定</h2><p className="mt-2 text-sm leading-6 text-slate-600">実際に手続きが完了した後だけ登録してください。月額削減額と年間換算を保存します。</p>{subscriptions.length === 0 ? <p className="mt-4 text-sm font-bold text-slate-600">登録中の契約がありません。</p> : <SavingsEventForm subscriptions={subscriptions} />}</Card><Card><h2 className="text-lg font-black">確定履歴（直近100件）</h2>{events.length === 0 ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-600">まだ節約実績はありません。</p> : <div className="mt-4 divide-y divide-slate-100">{events.map((event) => <article key={event.id} className="py-4 first:pt-0"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-black">{event.subscription.name}</p><p className="text-xs font-bold text-slate-500">{typeLabels[event.type] ?? event.type}・{dateFormatter.format(event.confirmedAt)}</p></div><p className="font-black text-emerald-700">月 {yen.format(event.monthlySaving)}</p></div>{event.note && <p className="mt-2 text-sm text-slate-600">{event.note}</p>}</article>)}</div>}</Card></div></AppShell>;
}
