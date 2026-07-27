"use client";

import Link from "next/link";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 text-slate-950">
      <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-black text-red-700">エラーが発生しました</p>
        <h1 className="mt-3 text-2xl font-black">ページを読み込めませんでした</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          サーバー側で問題が発生しました。時間をおいて再読み込みするか、ログインし直してください。
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="btn-primary">
            再読み込み
          </button>
          <Link href="/login" className="btn-secondary">
            ログインへ
          </Link>
        </div>
      </section>
    </main>
  );
}
