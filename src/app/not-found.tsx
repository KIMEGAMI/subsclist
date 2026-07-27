import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 text-slate-950">
      <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-black text-slate-500">404</p>
        <h1 className="mt-3 text-2xl font-black">ページが見つかりません</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          指定されたページは削除されたか、URLが間違っている可能性があります。
        </p>
        <Link href="/dashboard" className="btn-primary mt-6 w-full">
          ダッシュボードへ
        </Link>
      </section>
    </main>
  );
}
