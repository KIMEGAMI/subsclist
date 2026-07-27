"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ja">
      <body>
        <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-white">
          <section className="w-full max-w-lg rounded-lg border border-white/15 bg-white/10 p-6 shadow-2xl">
            <p className="text-sm font-black text-red-200">重大なエラーが発生しました</p>
            <h1 className="mt-3 text-2xl font-black">アプリを読み込めませんでした</h1>
            <p className="mt-3 text-sm leading-6 text-slate-200">
              サーバー側で問題が発生しました。時間をおいて再度お試しください。
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 inline-flex rounded-lg bg-white px-4 py-2 text-sm font-black text-slate-950"
            >
              再読み込み
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
