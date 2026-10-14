"use client";

import { useRef, useState } from "react";

type SubscriptionOption = { id: string; name: string };
export function SavingsEventForm({ subscriptions }: { subscriptions: SubscriptionOption[] }) {
  const [message, setMessage] = useState(""); const [loading, setLoading] = useState(false);
  const retryKey = useRef<{ fingerprint: string; key: string } | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      subscriptionId: form.get("subscriptionId"),
      type: String(form.get("type")),
      afterMonthlyAmount: Number(form.get("afterMonthlyAmount") || 0),
      note: form.get("note") || undefined,
    };
    const fingerprint = JSON.stringify(payload);
    const key = retryKey.current?.fingerprint === fingerprint
      ? retryKey.current.key
      : crypto.randomUUID();
    retryKey.current = { fingerprint, key };
    try {
      const response = await fetch("/api/savings-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, idempotencyKey: key }),
      });
      const data = await response.json() as { message?: string; event?: { monthlySaving: number } };
      setMessage(response.ok
        ? `節約実績を記録しました。月額削減 ${data.event?.monthlySaving.toLocaleString("ja-JP")}円`
        : data.message ?? "保存に失敗しました。");
      if (response.ok) {
        retryKey.current = null;
        formElement.reset();
      }
    } catch {
      setMessage("通信に失敗しました。同じ内容でもう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }
  return <form onSubmit={submit} className="mt-4 space-y-3"><select name="subscriptionId" className="input" required defaultValue=""><option value="" disabled>対象の契約</option>{subscriptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select name="type" className="input" defaultValue="CANCELLED"><option value="CANCELLED">解約</option><option value="PLAN_DOWNGRADE">プラン変更</option><option value="SWITCHED">乗り換え</option><option value="PRICE_RENEGOTIATED">料金交渉</option></select><input name="afterMonthlyAmount" className="input" type="number" min="0" required placeholder="変更後の月額（解約は0円）" /><input name="note" className="input" maxLength={500} placeholder="メモ（任意）" /><button type="submit" disabled={loading} className="btn-primary">{loading ? "保存中..." : "節約実績を確定"}</button>{message && <p className="text-sm font-bold text-slate-700">{message}</p>}</form>;
}
