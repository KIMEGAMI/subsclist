"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SyncResult = {
  imported?: unknown;
  failedServices?: unknown;
};

function messageForResult(result: SyncResult) {
  const imported = typeof result.imported === "number" ? result.imported : 0;
  const failedCount = Array.isArray(result.failedServices) ? result.failedServices.length : 0;
  return failedCount > 0
    ? `${imported}件を同期しました。一部の情報源は取得できませんでした。`
    : `${imported}件を同期しました。`;
}

export function NewsSyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function sync() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/news/sync", { method: "POST" });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || !result || typeof result !== "object") {
        throw new Error("sync_failed");
      }
      setMessage(messageForResult(result as SyncResult));
      router.refresh();
    } catch {
      setMessage("公式ニュースの同期に失敗しました。サーバー設定を確認してください。");
    } finally {
      setLoading(false);
    }
  }

  return <div className="mt-5"><button type="button" onClick={sync} disabled={loading} className="btn-primary">{loading ? "同期中..." : "公式ニュースを同期"}</button>{message && <p className="mt-3 text-sm font-bold text-slate-700">{message}</p>}</div>;
}
