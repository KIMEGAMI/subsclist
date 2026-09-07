"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MAX_ACCOUNTING_LABEL_LENGTH } from "@/lib/app-constants";
import { PAYMENT_HISTORY_BULK_MAX_ITEMS } from "@/lib/payment-history-bulk-organization";

export type PaymentHistoryBulkGroup = {
  subscriptionId: string;
  subscriptionName: string;
  categoryName: string | null;
  historyIds: string[];
};

export function PaymentHistoryBulkOrganizer({ groups }: { groups: PaymentHistoryBulkGroup[] }) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selectableIds = useMemo(() => groups.flatMap((group) => group.historyIds), [groups]);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  function toggleGroup(historyIds: string[]) {
    setSelectedIds((current) => {
      const next = new Set(current);
      const groupSelected = historyIds.every((id) => next.has(id));
      historyIds.forEach((id) => groupSelected ? next.delete(id) : next.add(id));
      if (next.size > PAYMENT_HISTORY_BULK_MAX_ITEMS) {
        setError(`一度に選択できるのは${PAYMENT_HISTORY_BULK_MAX_ITEMS}件までです。`);
        return current;
      }
      setError("");
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
      setError("");
      return;
    }
    if (selectableIds.length > PAYMENT_HISTORY_BULK_MAX_ITEMS) {
      setError(`一度に選択できるのは${PAYMENT_HISTORY_BULK_MAX_ITEMS}件までです。契約ごとに選択してください。`);
      return;
    }
    setSelectedIds(new Set(selectableIds));
    setError("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (selectedIds.size === 0) {
      setError("整理する契約を選択してください。");
      return;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const accountingLabel = String(form.get("accountingLabel") ?? "").trim();
    if (!accountingLabel) {
      setError("整理用科目を入力してください。");
      return;
    }
    if (!window.confirm(`選択した支払い履歴${selectedIds.size}件に「${accountingLabel}」を設定しますか？`)) return;

    setLoading(true);
    try {
      const response = await fetch("/api/payment-histories/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentHistoryIds: [...selectedIds], accountingLabel }),
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string; updatedCount?: number };
      if (!response.ok) throw new Error(result.message || "支払い履歴の一括整理に失敗しました。");
      setMessage(`${result.updatedCount ?? selectedIds.size}件に整理用科目を設定しました。`);
      setSelectedIds(new Set());
      formElement.reset();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "支払い履歴の一括整理に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  if (groups.length === 0) return null;

  return (
    <details className="mt-5 rounded-lg border border-cyan-200 bg-cyan-50/60">
      <summary className="cursor-pointer px-4 py-3 font-black text-slate-900">
        科目を一括設定
        <span className="ml-2 text-sm font-bold text-cyan-800">選択中 {selectedIds.size}件</span>
      </summary>
      <form onSubmit={submit} className="border-t border-cyan-100 p-4">
        <p className="text-sm font-semibold leading-6 text-slate-600">表示中の科目未設定履歴を契約単位で選び、同じ整理用科目をまとめて設定します。既に設定済みの科目は変更しません。</p>
        <div className="mt-4 rounded-lg border border-slate-200 bg-white/90">
          <label className="flex cursor-pointer items-center gap-3 border-b border-slate-200 px-4 py-3 text-sm font-black text-slate-800">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="size-4 accent-cyan-700" />
            表示中の科目未設定{selectableIds.length}件をすべて選択
          </label>
          <div className="grid max-h-64 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
            {groups.map((group) => {
              const checked = group.historyIds.every((id) => selectedIds.has(id));
              return (
                <label key={group.subscriptionId} className="flex cursor-pointer items-start gap-3 border-b border-slate-100 px-4 py-3 text-sm transition hover:bg-cyan-50/70">
                  <input type="checkbox" checked={checked} onChange={() => toggleGroup(group.historyIds)} className="mt-0.5 size-4 shrink-0 accent-cyan-700" />
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-slate-900">{group.subscriptionName}</span>
                    <span className="mt-1 block truncate text-xs font-semibold text-slate-500">{group.categoryName ?? "未分類"} / {group.historyIds.length}件</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="grid flex-1 gap-2 text-sm font-bold text-slate-700">
            整理用科目
            <input name="accountingLabel" className="input" maxLength={MAX_ACCOUNTING_LABEL_LENGTH} placeholder="例: 通信費、ソフトウェア利用料" required />
          </label>
          <button type="submit" disabled={loading} className="btn-primary justify-center">{loading ? "設定中..." : `選択した${selectedIds.size}件に設定`}</button>
        </div>
        {message && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p>}
        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
      </form>
    </details>
  );
}
