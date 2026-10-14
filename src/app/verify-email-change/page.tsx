import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/app-shell";
import { ONE_TIME_TOKEN_MAX_LENGTH } from "@/lib/app-constants";

export const metadata: Metadata = {
  title: "メールアドレス変更の確認 | SubscList",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function VerifyEmailChangePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const validToken = Boolean(
    token &&
      token.length >= 20 &&
      token.length <= ONE_TIME_TOKEN_MAX_LENGTH &&
      /^[A-Za-z0-9_-]+$/.test(token),
  );

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,#dbeafe_0%,transparent_34%),linear-gradient(135deg,#f8fafc_0%,#eef6ff_50%,#fdf2f8_100%)] px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-3 text-xl font-black">
          <span className="grid size-10 place-items-center rounded-lg bg-gradient-to-br from-blue-600 via-cyan-500 to-fuchsia-500 text-white shadow-lg shadow-blue-500/20">S</span>
          サブスクリスト
        </Link>
        <Card>
          <h1 className="text-2xl font-black">メールアドレス変更の確認</h1>
          {validToken ? (
            <>
              <p className="mt-4 text-sm leading-6 text-slate-700">
                新しいメールアドレスへの変更を確定します。心当たりがない場合は、このページを閉じてください。
              </p>
              <form action="/api/auth/verify-email-change" method="post" className="mt-6">
                <input type="hidden" name="token" value={token} />
                <button type="submit" className="btn-primary w-full">
                  メールアドレス変更を確定
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="mt-4 text-sm leading-6 text-red-700">
                確認リンクが無効です。設定画面から変更手続きをやり直してください。
              </p>
              <Link href="/settings" className="btn-primary mt-6 w-full">
                設定へ
              </Link>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
