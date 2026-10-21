import { redirect } from "next/navigation";
import { getCurrentUser, isAdminEmail } from "@/lib/auth";

export default async function MaintenancePage() {
  const user = await getCurrentUser();
  if (user?.emailVerified && isAdminEmail(user.email)) {
    redirect("/admin");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-white">
      <section className="w-full max-w-lg rounded-lg border border-white/15 bg-white/10 p-6 shadow-2xl backdrop-blur">
        <p className="text-sm font-black text-cyan-200">SubscList</p>
        <h1 className="mt-3 text-2xl font-black">ただいまメンテナンス中です</h1>
        <p className="mt-3 text-sm leading-6 text-slate-200">
          現在、サービス改善のため一時的にアクセスを制限しています。管理者はログイン後、管理画面から通常モードへ戻せます。
        </p>
        <div className="mt-6">
          <a href="/login?admin=1" className="inline-flex rounded-lg bg-white px-4 py-2 text-sm font-black text-slate-950">
            管理者ログインへ
          </a>
        </div>
      </section>
    </main>
  );
}
