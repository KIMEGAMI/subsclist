"use client";

import { useMemo, useState } from "react";

type SimulationSubscription = {
  id: string;
  name: string;
  monthlyCost: number;
  categoryName: string | null;
};

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const MONTHS_PER_YEAR = 12;

export function SubscriptionSimulator({ subscriptions }: { subscriptions: SimulationSubscription[] }) {
  const [keptIds, setKeptIds] = useState(() => new Set(subscriptions.map((subscription) => subscription.id)));
  const currentMonthlyTotal = useMemo(() => subscriptions.reduce((total, subscription) => total + subscription.monthlyCost, 0), [subscriptions]);
  const simulatedMonthlyTotal = useMemo(() => subscriptions.filter((subscription) => keptIds.has(subscription.id)).reduce((total, subscription) => total + subscription.monthlyCost, 0), [keptIds, subscriptions]);
  const monthlySaving = Math.max(0, currentMonthlyTotal - simulatedMonthlyTotal);
  const removedCount = subscriptions.length - keptIds.size;

  function toggleSubscription(id: string) {
    setKeptIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetSimulation() {
    setKeptIds(new Set(subscriptions.map((subscription) => subscription.id)));
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-4"><p className="text-sm font-bold text-slate-500">現在の月額換算</p><p className="mt-1 text-2xl font-black">{yen.format(currentMonthlyTotal)}</p></div>
        <div className="rounded-lg bg-blue-50 p-4"><p className="text-sm font-bold text-blue-700">シミュレーション後</p><p className="mt-1 text-2xl font-black text-slate-950">{yen.format(simulatedMonthlyTotal)}</p></div>
        <div className="rounded-lg bg-emerald-50 p-4"><p className="text-sm font-bold text-emerald-700">年間削減見込み</p><p className="mt-1 text-2xl font-black text-slate-950">{yen.format(monthlySaving * MONTHS_PER_YEAR)}</p></div>
      </div>
      <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-4 text-sm font-semibold text-amber-900">
        {removedCount === 0 ? "外す契約を選ぶと、月額・年間の削減見込みを比較できます。" : `${removedCount}件を外す場合、月 ${yen.format(monthlySaving)} / 年 ${yen.format(monthlySaving * MONTHS_PER_YEAR)} の削減見込みです。`}
      </div>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 bg-white/70 px-4">
        {subscriptions.map((subscription) => {
          const kept = keptIds.has(subscription.id);
          return (
            <label key={subscription.id} className="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-3">
              <span className="flex min-w-0 items-center gap-3"><input type="checkbox" checked={kept} onChange={() => toggleSubscription(subscription.id)} className="size-5 accent-blue-600" /><span className="min-w-0"><span className="block truncate font-bold text-slate-950">{subscription.name}</span><span className="mt-1 block text-xs font-semibold text-slate-500">{subscription.categoryName ?? "未分類"}</span></span></span>
              <span className="shrink-0 font-black text-slate-950">{yen.format(subscription.monthlyCost)}/月</span>
            </label>
          );
        })}
      </div>
      <button type="button" onClick={resetSimulation} className="btn-secondary">すべて残す</button>
      <p className="text-xs font-semibold leading-5 text-slate-500">この操作は比較用です。登録済みのサブスク、支払い履歴、Stripe契約は変更されません。</p>
    </div>
  );
}
