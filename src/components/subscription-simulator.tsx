"use client";

import { useMemo, useState } from "react";
import {
  calculateSimulationTotals,
  virtualSubscriptionSchema,
} from "@/lib/subscription-simulation";
import {
  MAX_CATEGORY_NAME_LENGTH,
  MAX_SUBSCRIPTION_NAME_LENGTH,
  MAX_SUBSCRIPTION_PRICE,
} from "@/lib/app-constants";

type SimulationSubscription = {
  id: string;
  name: string;
  monthlyCost: number;
  categoryName: string | null;
};

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});
const MONTHS_PER_YEAR = 12;

export function SubscriptionSimulator({
  subscriptions,
}: {
  subscriptions: SimulationSubscription[];
}) {
  const [keptIds, setKeptIds] = useState(
    () => new Set(subscriptions.map((subscription) => subscription.id)),
  );
  const [virtualSubscriptions, setVirtualSubscriptions] = useState<
    SimulationSubscription[]
  >([]);
  const [error, setError] = useState("");
  const categories = useMemo(
    () =>
      [
        ...new Set(
          subscriptions
            .map((item) => item.categoryName)
            .filter((category): category is string => category !== null),
        ),
      ].sort((left, right) => left.localeCompare(right, "ja")),
    [subscriptions],
  );
  const totals = useMemo(
    () =>
      calculateSimulationTotals(
        subscriptions,
        keptIds,
        virtualSubscriptions,
      ),
    [keptIds, subscriptions, virtualSubscriptions],
  );
  const removedCount = subscriptions.length - keptIds.size;
  const annualDifference = totals.monthlyDifference * MONTHS_PER_YEAR;
  const isSaving = totals.monthlyDifference >= 0;

  function toggleSubscription(id: string) {
    setKeptIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addVirtualSubscription(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const parsed = virtualSubscriptionSchema.safeParse(values);
    if (!parsed.success) {
      setError("サービス名と0円以上の月額換算額を確認してください。");
      return;
    }
    setVirtualSubscriptions((current) => [
      ...current,
      {
        id: `virtual-${crypto.randomUUID()}`,
        name: parsed.data.name,
        monthlyCost: parsed.data.monthlyCost,
        categoryName: parsed.data.categoryName || null,
      },
    ]);
    form.reset();
  }

  function removeVirtualSubscription(id: string) {
    setVirtualSubscriptions((current) =>
      current.filter((subscription) => subscription.id !== id),
    );
  }

  function resetSimulation() {
    setKeptIds(new Set(subscriptions.map((subscription) => subscription.id)));
    setVirtualSubscriptions([]);
    setError("");
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-500">現在の月額換算</p>
          <p className="mt-1 text-2xl font-black">
            {yen.format(totals.currentMonthlyTotal)}
          </p>
        </div>
        <div className="rounded-lg bg-blue-50 p-4">
          <p className="text-sm font-bold text-blue-700">シミュレーション後</p>
          <p className="mt-1 text-2xl font-black text-slate-950">
            {yen.format(totals.simulatedMonthlyTotal)}
          </p>
        </div>
        <div className={`rounded-lg p-4 ${isSaving ? "bg-emerald-50" : "bg-amber-50"}`}>
          <p className={`text-sm font-bold ${isSaving ? "text-emerald-700" : "text-amber-800"}`}>
            年間{isSaving ? "削減" : "増加"}見込み
          </p>
          <p className="mt-1 text-2xl font-black text-slate-950">
            {yen.format(Math.abs(annualDifference))}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-4 text-sm font-semibold leading-6 text-amber-900">
        {removedCount === 0 && virtualSubscriptions.length === 0
          ? "外す契約を選ぶか、比較したい新しいサービスを追加してください。"
          : `${removedCount}件を外し、${virtualSubscriptions.length}件を追加した場合、月額は ${yen.format(Math.abs(totals.monthlyDifference))} ${isSaving ? "減少" : "増加"}します。`}
      </div>

      <section aria-labelledby="existing-subscriptions-heading">
        <h2 id="existing-subscriptions-heading" className="text-base font-black text-slate-950">
          現在の契約
        </h2>
        <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100 bg-white/70 px-4">
          {subscriptions.length === 0 ? (
            <p className="py-5 text-sm font-semibold text-slate-500">登録済みの有効な契約はありません。</p>
          ) : subscriptions.map((subscription) => {
            const kept = keptIds.has(subscription.id);
            return (
              <label key={subscription.id} className="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-3">
                <span className="flex min-w-0 items-center gap-3">
                  <input type="checkbox" checked={kept} onChange={() => toggleSubscription(subscription.id)} className="size-5 accent-blue-600" />
                  <span className="min-w-0">
                    <span className="block break-words font-bold text-slate-950">{subscription.name}</span>
                    <span className="mt-1 block text-xs font-semibold text-slate-500">{subscription.categoryName ?? "未分類"}</span>
                  </span>
                </span>
                <span className="shrink-0 font-black text-slate-950">{yen.format(subscription.monthlyCost)}/月</span>
              </label>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="virtual-subscriptions-heading">
        <h2 id="virtual-subscriptions-heading" className="text-base font-black text-slate-950">
          比較する新しいサービス
        </h2>
        <form onSubmit={addVirtualSubscription} noValidate className="mt-3 grid gap-3 rounded-lg border border-blue-100 bg-blue-50/60 p-4 md:grid-cols-[1fr_180px_1fr_auto] md:items-end">
          <label className="text-sm font-bold text-slate-700">
            サービス名
            <input name="name" className="input mt-2" maxLength={MAX_SUBSCRIPTION_NAME_LENGTH} required />
          </label>
          <label className="text-sm font-bold text-slate-700">
            月額換算
            <input name="monthlyCost" type="number" className="input mt-2" min={0} max={MAX_SUBSCRIPTION_PRICE} step={1} required />
          </label>
          <label className="text-sm font-bold text-slate-700">
            カテゴリ（任意）
            <input name="categoryName" className="input mt-2" maxLength={MAX_CATEGORY_NAME_LENGTH} list="simulation-categories" />
            <datalist id="simulation-categories">
              {categories.map((category) => <option key={category} value={category} />)}
            </datalist>
          </label>
          <button type="submit" className="btn-primary min-h-11 justify-center">追加</button>
        </form>
        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        {virtualSubscriptions.length > 0 && (
          <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100 bg-white/70 px-4">
            {virtualSubscriptions.map((subscription) => (
              <div key={subscription.id} className="flex min-h-14 items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="break-words font-bold text-slate-950">{subscription.name}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{subscription.categoryName ?? "未分類"} / {yen.format(subscription.monthlyCost)}/月</p>
                </div>
                <button type="button" onClick={() => removeVirtualSubscription(subscription.id)} className="btn-secondary min-h-10 shrink-0 px-3 py-2 text-sm" aria-label={`${subscription.name}を比較から削除`}>
                  削除
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <button type="button" onClick={resetSimulation} className="btn-secondary">比較をリセット</button>
      <p className="text-xs font-semibold leading-5 text-slate-500">この操作はブラウザ内の比較だけに使用します。登録済みサブスク、DB、支払い履歴、Stripe契約は変更されません。</p>
    </div>
  );
}
