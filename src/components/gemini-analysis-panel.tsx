"use client";

import Link from "next/link";
import { useState } from "react";
import {
  geminiAnalysisSchema,
  type GeminiAnalysis,
} from "@/lib/gemini-analysis";

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

type AnalysisResponse = {
  analysis: GeminiAnalysis;
  model: string;
  generatedAt: string;
};

function decisionLabel(value: GeminiAnalysis["recommendations"][number]["decision"]) {
  if (value === "KEEP") return "継続候補";
  if (value === "REVIEW_PLAN") return "プラン見直し";
  if (value === "SWITCH") return "乗り換え比較";
  return "解約検討";
}

function confidenceLabel(value: GeminiAnalysis["recommendations"][number]["confidence"]) {
  if (value === "HIGH") return "確度 高";
  if (value === "MEDIUM") return "確度 中";
  return "確度 低";
}

function parseResponse(value: unknown): AnalysisResponse | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const analysis = geminiAnalysisSchema.safeParse(record.analysis);
  if (
    !analysis.success ||
    typeof record.model !== "string" ||
    typeof record.generatedAt !== "string"
  ) return null;
  return {
    analysis: analysis.data,
    model: record.model,
    generatedAt: record.generatedAt,
  };
}

export function GeminiAnalysisPanel({ configured }: { configured: boolean }) {
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResponse | null>(null);

  async function generate() {
    if (!consent || loading || !configured) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/gemini/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          payload && typeof payload === "object" &&
          typeof (payload as Record<string, unknown>).message === "string"
            ? String((payload as Record<string, unknown>).message)
            : "Gemini比較分析を生成できませんでした。";
        throw new Error(message);
      }
      const parsed = parseResponse(payload);
      if (!parsed) throw new Error("分析結果の形式を確認できませんでした。");
      setResult(parsed);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "通信に失敗しました。もう一度お試しください。",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-6 border-y border-cyan-200 bg-white/70 px-4 py-6 shadow-sm backdrop-blur-sm sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-cyan-700">Gemini比較分析</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">契約の継続・見直し・代替候補を比較</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            利用頻度や月額換算を基に、見直しの優先順位を整理します。最新料金や提供状況は各サービスの公式情報で確認してください。
          </p>
        </div>
        <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-800">Premium</span>
      </div>

      {!configured ? (
        <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
          Gemini APIが未設定です。サーバーの環境変数にGEMINI_API_KEYを設定してください。
        </div>
      ) : (
        <div className="mt-5">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-1 size-4 accent-cyan-600"
            />
            <span>
              契約名、カテゴリ、月額換算、利用頻度、優先度、更新日をGoogle Geminiへ送信することに同意します。メール、メモ、支払い方法、URLは送信しません。
            </span>
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-primary min-h-11"
              disabled={!consent || loading}
              onClick={generate}
            >
              {loading ? "比較を生成中..." : "Geminiで比較を生成"}
            </button>
            <span className="text-xs font-semibold text-slate-500">1時間3回・1日10回まで</span>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-4">
            <p className="font-bold leading-7 text-slate-800">{result.analysis.summary}</p>
            <p className="text-xs text-slate-500">
              {new Date(result.generatedAt).toLocaleString("ja-JP")} / {result.model}
            </p>
          </div>
          <div className="divide-y divide-slate-200">
            {result.analysis.recommendations.map((item) => (
              <article key={item.subscriptionId} className="py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/subscriptions/${item.subscriptionId}`} className="font-black text-slate-950 hover:text-cyan-700">
                    {item.subscriptionName ?? "契約詳細を確認"}
                  </Link>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{decisionLabel(item.decision)}</span>
                  <span className="text-xs font-semibold text-slate-500">{confidenceLabel(item.confidence)}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-700">{item.reason}</p>
                {item.potentialMonthlySavings !== null && item.potentialMonthlySavings > 0 && (
                  <p className="mt-2 text-sm font-bold text-emerald-700">
                    AI試算の削減目安: 月額 {yen.format(item.potentialMonthlySavings)}（要確認）
                  </p>
                )}
                {item.alternatives.length > 0 && (
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {item.alternatives.map((alternative) => (
                      <div key={alternative.name} className="border-l-4 border-cyan-400 bg-cyan-50/70 p-3">
                        <p className="font-bold text-slate-900">{alternative.name}</p>
                        <p className="mt-1 text-xs font-semibold text-cyan-800">
                          {alternative.estimatedMonthlyPrice === null
                            ? "料金要確認"
                            : `月額目安 ${yen.format(alternative.estimatedMonthlyPrice)}`}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{alternative.comparison}</p>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
          {result.analysis.recommendations.length === 0 && (
            <p className="py-5 text-sm text-slate-600">優先度の高い見直し候補は見つかりませんでした。</p>
          )}
          <p className="border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">
            AIの回答は判断材料です。料金、機能、解約条件、データ移行の可否は契約前に公式サイトで確認してください。
          </p>
        </div>
      )}
    </section>
  );
}
