"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type DailyNewsResult = {
  skipped?: unknown;
  generatedArticles?: unknown;
  failedArticleCount?: unknown;
  geminiQuotaLimited?: unknown;
};

function resultMessage(value: DailyNewsResult) {
  const generated = typeof value.generatedArticles === "number" ? value.generatedArticles : 0;
  const failures = typeof value.failedArticleCount === "number" ? value.failedArticleCount : 0;
  if (value.skipped === true) return "本日分の契約ニュースはすでに更新済みです。";
  if (value.geminiQuotaLimited === true) {
    return "Gemini APIの利用上限に達しています。Google AI Studioの利用枠または請求設定を確認してください。";
  }
  return failures > 0
    ? `${generated}件を作成しました。一部のサービスは確認できませんでした。`
    : `${generated}件を作成しました。`;
}

export function NewsDailyButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function generate() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/news/daily", { method: "POST" });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || !result || typeof result !== "object") throw new Error("news_generation_failed");
      setMessage(resultMessage(result as DailyNewsResult));
      router.refresh();
    } catch {
      setMessage("契約ニュースの更新に失敗しました。公式情報源とジョブ状態を確認してください。");
    } finally {
      setLoading(false);
    }
  }

  return <div className="mt-5"><button type="button" onClick={generate} disabled={loading} className="btn-primary">{loading ? "更新中..." : "契約ニュースを今すぐ更新"}</button>{message && <p className="mt-3 text-sm font-bold text-slate-700">{message}</p>}</div>;
}
