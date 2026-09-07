"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  MAX_BUSINESS_USE_PERCENT,
  MIN_BUSINESS_USE_PERCENT,
} from "@/lib/app-constants";

type Option = { id: string; name: string };
type BulkSubscription = {
  id: string;
  name: string;
  categoryName: string | null;
  paymentMethodName: string | null;
};

const clearValue = "__CLEAR__";

export function SubscriptionBulkEditor({
  subscriptions,
  categories,
  paymentMethods,
}: {
  subscriptions: BulkSubscription[];
  categories: Option[];
  paymentMethods: Option[];
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selectableIds = useMemo(() => subscriptions.map((item) => item.id), [subscriptions]);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  function toggleOne(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(selectableIds));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (selectedIds.size === 0) {
      setError("更新する契約を選択してください。");
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload: Record<string, unknown> = { subscriptionIds: [...selectedIds] };
    const categoryId = String(form.get("categoryId") ?? "");
    const paymentMethodId = String(form.get("paymentMethodId") ?? "");
    const usageFrequency = String(form.get("usageFrequency") ?? "");
    const priority = String(form.get("priority") ?? "");
    const businessUsePercent = String(form.get("businessUsePercent") ?? "").trim();
    const markReviewed = form.get("markReviewed") === "on";

    if (categoryId) payload.categoryId = categoryId === clearValue ? null : categoryId;
    if (paymentMethodId) payload.paymentMethodId = paymentMethodId === clearValue ? null : paymentMethodId;
    if (usageFrequency) payload.usageFrequency = usageFrequency;
    if (priority) payload.priority = priority;
    if (businessUsePercent) payload.businessUsePercent = Number(businessUsePercent);
    if (markReviewed) payload.markReviewed = true;

    if (Object.keys(payload).length === 1) {
      setError("一括で変更する項目を選択してください。");
      return;
    }
    if (!window.confirm(`選択した${selectedIds.size}件を一括更新しますか？`)) return;

    setLoading(true);
    try {
      const response = await fetch("/api/subscriptions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        updatedCount?: number;
      };
      if (!response.ok) throw new Error(result.message || "一括更新に失敗しました。");
      const updatedCount = result.updatedCount ?? selectedIds.size;
      setMessage(`${updatedCount}件の契約情報を更新しました。`);
      setSelectedIds(new Set());
      formElement.reset();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "一括更新に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  if (subscriptions.length === 0) return null;

  return (
    <details className="mb-5 rounded-lg border border-blue-100 bg-white/90 shadow-sm backdrop-blur-xl">
      <summary className="cursor-pointer px-5 py-4 font-black text-slate-900">
        一括整理
        <span className="ml-2 text-sm font-bold text-blue-700">選択中 {selectedIds.size}件</span>
      </summary>
      <form onSubmit={submit} className="border-t border-slate-100 p-5">
        <p className="text-sm font-semibold leading-6 text-slate-600">
          現在の検索結果から契約を選び、共通する項目だけをまとめて変更します。選択しない項目は変更されません。
        </p>
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/80">
          <label className="flex cursor-pointer items-center gap-3 border-b border-slate-200 px-4 py-3 text-sm font-black text-slate-800">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="size-4 accent-blue-600" />
            表示中の{subscriptions.length}件をすべて選択
          </label>
          <div className="grid max-h-64 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
            {subscriptions.map((item) => (
              <label key={item.id} className="flex cursor-pointer items-start gap-3 border-b border-slate-100 px-4 py-3 text-sm transition hover:bg-blue-50/70">
                <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleOne(item.id)} className="mt-0.5 size-4 shrink-0 accent-blue-600" />
                <span className="min-w-0">
                  <span className="block truncate font-bold text-slate-900">{item.name}</span>
                  <span className="mt-1 block truncate text-xs font-semibold text-slate-500">{item.categoryName ?? "カテゴリ未設定"} / {item.paymentMethodName ?? "支払い方法未設定"}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">カテゴリ</span>
            <select name="categoryId" defaultValue="" className="input">
              <option value="">変更しない</option>
              <option value={clearValue}>未設定にする</option>
              {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">支払い方法</span>
            <select name="paymentMethodId" defaultValue="" className="input">
              <option value="">変更しない</option>
              <option value={clearValue}>未設定にする</option>
              {paymentMethods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">利用頻度</span>
            <select name="usageFrequency" defaultValue="" className="input">
              <option value="">変更しない</option>
              <option value="DAILY">毎日</option>
              <option value="WEEKLY">週に数回</option>
              <option value="MONTHLY">月に数回</option>
              <option value="RARELY">ほとんど使わない</option>
              <option value="UNKNOWN">未設定</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">重要度</span>
            <select name="priority" defaultValue="" className="input">
              <option value="">変更しない</option>
              <option value="ESSENTIAL">必須</option>
              <option value="USEFUL">あると便利</option>
              <option value="OPTIONAL">なくてもよい</option>
              <option value="UNKNOWN">未設定</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">仕事利用割合</span>
            <input name="businessUsePercent" type="number" min={MIN_BUSINESS_USE_PERCENT} max={MAX_BUSINESS_USE_PERCENT} step="1" className="input" placeholder="変更しない" />
          </label>
        </div>

        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-center gap-3 text-sm font-bold text-slate-700">
            <input name="markReviewed" type="checkbox" className="size-4 accent-blue-600" />
            選択した契約を今日見直し済みにする
          </label>
          <button type="submit" disabled={loading} className="btn-primary justify-center">
            {loading ? "更新中..." : `選択した${selectedIds.size}件を更新`}
          </button>
        </div>
        {message && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p>}
        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
      </form>
    </details>
  );
}
