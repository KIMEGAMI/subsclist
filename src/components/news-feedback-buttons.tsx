"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type NewsFeedback = "USEFUL" | "NOT_INTERESTED";

export function NewsFeedbackButtons({ newsItemId, initialFeedback = null }: { newsItemId: string; initialFeedback?: NewsFeedback | null }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<NewsFeedback | null>(initialFeedback);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(value: NewsFeedback) {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/subscription-news/${newsItemId}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback: value }) });
      if (!response.ok) throw new Error("feedback_failed");
      setFeedback(value);
      router.refresh();
    } catch { setError("フィードバックを保存できませんでした。"); }
    finally { setLoading(false); }
  }
  return <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-slate-500">表示内容の評価</span><button type="button" disabled={loading} aria-pressed={feedback === "USEFUL"} onClick={() => submit("USEFUL")} className={`rounded-md border px-2 py-1 text-xs font-bold ${feedback === "USEFUL" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"}`}>役に立った</button><button type="button" disabled={loading} aria-pressed={feedback === "NOT_INTERESTED"} onClick={() => submit("NOT_INTERESTED")} className={`rounded-md border px-2 py-1 text-xs font-bold ${feedback === "NOT_INTERESTED" ? "border-slate-400 bg-slate-100 text-slate-800" : "border-slate-200 bg-white text-slate-600"}`}>興味なし</button>{error && <span className="text-xs font-bold text-red-700">{error}</span>}</div>;
}
