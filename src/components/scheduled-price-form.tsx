"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MAX_SUBSCRIPTION_PRICE } from "@/lib/app-constants";
import { userErrorMessage, userMessage } from "@/lib/error-messages";
import { scheduledPriceDifference } from "@/lib/scheduled-price";

type ScheduledPriceFormProps = {
  subscriptionId: string;
  currentPrice: number;
  scheduledPrice: number | null;
  scheduledPriceAt: string | null;
  today: string;
  isDue: boolean;
  canSchedule: boolean;
};

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

export function ScheduledPriceForm({
  subscriptionId,
  currentPrice,
  scheduledPrice,
  scheduledPriceAt,
  today,
  isDue,
  canSchedule,
}: ScheduledPriceFormProps) {
  const router = useRouter();
  const [price, setPrice] = useState(String(scheduledPrice ?? currentPrice));
  const [effectiveAt, setEffectiveAt] = useState(scheduledPriceAt ?? today);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const parsedPrice = Number(price);
  const difference = Number.isInteger(parsedPrice)
    ? scheduledPriceDifference(currentPrice, parsedPrice)
    : null;

  async function mutate(method: "PUT" | "DELETE" | "PATCH") {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/subscriptions/${subscriptionId}/scheduled-price`, {
        method,
        headers: method === "PUT" ? { "Content-Type": "application/json" } : undefined,
        body: method === "PUT" ? JSON.stringify({ price, effectiveAt }) : undefined,
      });
      const data = (await response.json().catch(() => ({
        message: "価格変更予定の更新に失敗しました。",
      }))) as { message?: string };
      if (!response.ok) {
        throw new Error(userMessage(data.message, "価格変更予定の更新に失敗しました。"));
      }
      setMessage(userMessage(data.message, "価格変更予定を更新しました。"));
      router.refresh();
    } catch (error) {
      setMessage(userErrorMessage(error, "価格変更予定の更新に失敗しました。"));
    } finally {
      setLoading(false);
    }
  }

  function applyScheduledPrice() {
    const confirmed = window.confirm(
      `現在価格を${scheduledPrice === null ? "予定額" : yen.format(scheduledPrice)}へ変更し、変更前の価格を履歴へ保存しますか？`,
    );
    if (confirmed) void mutate("PATCH");
  }

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-black text-blue-700">PRICE CHANGE</p>
          <h2 className="mt-2 text-lg font-black text-slate-950">次回の価格変更を予約</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            キャンペーン終了や値上げ予定を先に登録し、通知後に内容を確認して現在価格へ反映します。自動では変更しません。
          </p>
        </div>
        {scheduledPrice !== null && scheduledPriceAt && (
          <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-black ${isDue ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>
            {isDue ? "反映待ち" : `${scheduledPriceAt} 変更予定`}
          </span>
        )}
      </div>

      {scheduledPrice !== null && scheduledPriceAt && (
        <div className={`mt-4 rounded-lg border p-4 ${isDue ? "border-red-200 bg-red-50/70" : "border-blue-100 bg-blue-50/70"}`}>
          <p className="text-sm font-bold text-slate-600">現在 {yen.format(currentPrice)} → 予定 {yen.format(scheduledPrice)}</p>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            差額 {scheduledPriceDifference(currentPrice, scheduledPrice) >= 0 ? "+" : ""}{yen.format(scheduledPriceDifference(currentPrice, scheduledPrice))}
          </p>
          {isDue && <p className="mt-2 text-sm font-black text-red-700">変更予定日を過ぎています。請求条件を確認して反映または解除してください。</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={loading} onClick={applyScheduledPrice} className="btn-primary min-h-0 px-3 py-2 text-sm">
              {loading ? "更新中..." : "現在価格へ反映"}
            </button>
            <button type="button" disabled={loading} onClick={() => mutate("DELETE")} className="btn-secondary min-h-0 px-3 py-2 text-sm">
              予定を解除
            </button>
          </div>
        </div>
      )}

      {canSchedule ? (
        <>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              void mutate("PUT");
            }}
          >
            <label className="grid gap-1.5 text-sm font-bold text-slate-700">
              変更後の料金
              <input
                type="number"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                min={0}
                max={MAX_SUBSCRIPTION_PRICE}
                step={1}
                required
                className="input"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-bold text-slate-700">
              変更予定日
              <input
                type="date"
                value={effectiveAt}
                onChange={(event) => setEffectiveAt(event.target.value)}
                min={today}
                required
                className="input"
              />
            </label>
            <button type="submit" disabled={loading || difference === 0} className="btn-secondary whitespace-nowrap">
              {loading ? "保存中..." : scheduledPrice === null ? "予定を保存" : "予定を更新"}
            </button>
          </form>
          {difference !== null && difference !== 0 && (
            <p className={`mt-2 text-sm font-semibold ${difference > 0 ? "text-amber-700" : "text-emerald-700"}`}>
              現在との差額: {difference > 0 ? "+" : ""}{yen.format(difference)}
            </p>
          )}
          {difference === 0 && <p className="mt-2 text-sm font-semibold text-slate-500">現在と異なる料金を入力してください。</p>}
        </>
      ) : (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-900">
          Freeプランでは新しい価格変更予定を登録できません。既に登録済みの予定は、現在価格へ反映するか解除できます。
        </p>
      )}
      {message && <p role="status" className="mt-3 text-sm font-semibold text-slate-700">{message}</p>}
    </div>
  );
}
