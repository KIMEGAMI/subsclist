"use client";

import { useState } from "react";
import { userErrorMessage, userMessage } from "@/lib/error-messages";

type Recommendation = {
  currentService: string;
  category: string;
  priority: "高" | "中" | "低";
  reason: string;
  recommendedAction: string;
  expectedMonthlyImpact: string;
  risk: string;
  alternatives: Array<{
    name: string;
    why: string;
    estimatedPrice: string;
    officialUrl: string;
  }>;
};

type Result = {
  summary: string;
  notes: string[];
  recommendations: Recommendation[];
};

async function postRecommendations(subscriptionId: string) {
  const response = await fetch("/api/ai/recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscriptionId }),
  });
  const data = (await response.json().catch(() => ({ message: "AIレコメンドの生成に失敗しました。" }))) as Result & { message?: string };
  if (!response.ok) throw new Error(userMessage(data.message, "AIレコメンドの生成に失敗しました。"));
  return data;
}

function priorityClass(priority: Recommendation["priority"]) {
  if (priority === "高") return "bg-red-50 text-red-700 ring-red-100";
  if (priority === "中") return "bg-amber-50 text-amber-700 ring-amber-100";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export function AiRecommendationsPanel({ subscriptionId, serviceName }: { subscriptionId: string; serviceName: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function generate() {
    setError("");
    setLoading(true);
    try {
      setResult(await postRecommendations(subscriptionId));
    } catch (err) {
      setError(userErrorMessage(err, "AIレコメンドの生成に失敗しました。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-lg border border-blue-100 bg-gradient-to-br from-blue-50/95 to-cyan-50/90 p-5 shadow-[0_16px_38px_rgba(37,99,235,0.10)]">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 via-cyan-500 to-fuchsia-500" />
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="text-xl font-black text-blue-950">AI乗り換え診断</h2>
            <p className="mt-2 text-sm leading-6 text-blue-900">
              {serviceName} について、より新しい代替サービス、統合できる契約、見直し候補をAIが提案します。
            </p>
          </div>
          <button disabled={loading} onClick={generate} className="btn-primary">
            {loading ? "診断中..." : "AIで診断する"}
          </button>
        </div>
        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      </section>

      {result && (
        <>
          <section className="rounded-lg border border-white/75 bg-white/92 p-5 shadow-[0_16px_38px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <h2 className="text-lg font-black">診断サマリー</h2>
            <p className="mt-3 text-sm leading-7 text-slate-700">{result.summary}</p>
            <div className="mt-4 grid gap-2">
              {result.notes.map((note) => (
                <p key={note} className="rounded-lg border border-slate-100 bg-white/70 p-3 text-sm font-semibold text-slate-600">{note}</p>
              ))}
            </div>
          </section>

          <div className="grid gap-5">
            {result.recommendations.map((item) => (
              <section key={`${item.currentService}-${item.recommendedAction}`} className="rounded-lg border border-white/75 bg-white/92 p-5 shadow-[0_16px_38px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl font-black">{item.currentService}</h3>
                      <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${priorityClass(item.priority)}`}>優先度 {item.priority}</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{item.category}</span>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-700">{item.reason}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm font-black text-emerald-700 md:min-w-44 md:text-center">
                    {item.expectedMonthlyImpact}
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                  <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-4">
                    <p className="text-sm font-bold text-slate-500">おすすめアクション</p>
                    <p className="mt-2 text-sm leading-7 text-slate-700">{item.recommendedAction}</p>
                    <p className="mt-4 text-sm font-bold text-slate-500">注意点</p>
                    <p className="mt-2 text-sm leading-7 text-slate-700">{item.risk}</p>
                  </div>
                  <div className="grid gap-3">
                    {item.alternatives.map((alternative) => (
                      <a key={alternative.name} href={alternative.officialUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-100 bg-white/85 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:shadow-md">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <p className="font-bold">{alternative.name}</p>
                          <p className="text-sm font-bold text-blue-700">{alternative.estimatedPrice}</p>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{alternative.why}</p>
                        <p className="mt-2 text-xs font-semibold text-slate-500">公式サイトを開く</p>
                      </a>
                    ))}
                  </div>
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
