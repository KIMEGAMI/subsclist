import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/app-shell";
import { ResendVerificationButton } from "@/components/auth-views";
import { getCurrentUser } from "@/lib/auth";

function statusMessage(status?: string) {
  if (status === "success") {
    return { ok: true, message: "メール認証が完了しました。" };
  }
  if (status === "error") {
    return { ok: false, message: "メール認証中にエラーが発生しました。時間をおいて再度お試しください。" };
  }
  if (status === "invalid") {
    return { ok: false, message: "認証リンクが無効、または有効期限切れです。" };
  }
  return null;
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; mail?: string; status?: string }>;
}) {
  const { token, mail, status } = await searchParams;
  if (token) {
    redirect(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
  }

  const result = statusMessage(status);
  const user = await getCurrentUser();

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,#dbeafe_0%,transparent_34%),linear-gradient(135deg,#f8fafc_0%,#eef6ff_50%,#fdf2f8_100%)] px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-3 text-xl font-black">
          <span className="grid size-10 place-items-center rounded-lg bg-gradient-to-br from-blue-600 via-cyan-500 to-fuchsia-500 text-white shadow-lg shadow-blue-500/20">S</span>
          サブスクリスト
        </Link>
        <Card>
          <h1 className="text-2xl font-black">メール認証</h1>
          {result ? (
            <>
              <p className={`mt-4 text-sm leading-6 ${result.ok ? "text-emerald-700" : "text-red-700"}`}>
                {result.message}
              </p>
              <Link href={result.ok ? "/dashboard" : "/login"} className="btn-primary mt-6 w-full">
                {result.ok ? "ダッシュボードへ" : "ログインへ"}
              </Link>
            </>
          ) : (
            <>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                登録メールアドレス宛に送信した認証リンクを開いてください。メールが届かない場合は再送できます。
              </p>
              {mail === "failed" && (
                <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-800">
                  登録は完了していますが、最初の認証メール送信に失敗しました。下のボタンから認証メールを再送してください。
                </p>
              )}
              {user && !user.emailVerified ? (
                <ResendVerificationButton />
              ) : (
                <Link href="/login" className="btn-primary mt-6 w-full">
                  ログインへ
                </Link>
              )}
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
