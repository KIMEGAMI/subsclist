"use client";

import { useState } from "react";

export function PriceSyncButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  async function sync() {
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/admin/prices/sync", { method: "POST" });
      const data = await response.json() as { snapshots?: number; changes?: number; failedServices?: string[]; message?: string };
      if (!response.ok) throw new Error(data.message ?? "価格の確認に失敗しました。");
      const failed = data.failedServices?.length ?? 0;
      setMessage(`価格 ${data.snapshots ?? 0}件を確認、変更 ${data.changes ?? 0}件を検出しました${failed > 0 ? `（取得失敗 ${failed}サービス）` : "。"}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "価格の確認に失敗しました。"); }
    finally { setLoading(false); }
  }
  return <div className="mt-5"><button type="button" onClick={sync} disabled={loading} className="btn-primary">{loading ? "確認中..." : "公式価格を確認"}</button>{message && <p className="mt-3 text-sm font-bold text-slate-700">{message}</p>}</div>;
}
