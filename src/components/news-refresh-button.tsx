"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type RefreshResult = { imported?: unknown; failedServices?: unknown; message?: unknown };

export function NewsRefreshButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function refreshNews() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/subscription-news/sync", { method: "POST" });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || !result || typeof result !== "object") {
        const error = result as RefreshResult | null;
        throw new Error(typeof error?.message === "string" ? error.message : "更新に失敗しました。");
      }
      const data = result as RefreshResult;
      const imported = typeof data.imported === "number" ? data.imported : 0;
      const failed = Array.isArray(data.failedServices) ? data.failedServices.length : 0;
      setMessage(failed > 0 ? `${imported}件を取得しました。一部の情報源は確認できませんでした。` : `${imported}件を確認しました。`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "最新情報の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  return <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={refreshNews} disabled={loading} className="btn-primary">{loading ? "取得中..." : "最新情報を取得"}</button>{message && <p className="text-sm font-bold text-slate-700" role="status">{message}</p>}</div>;
}
