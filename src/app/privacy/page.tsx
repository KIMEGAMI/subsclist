import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "プライバシーポリシー | サブスクリスト",
  description: "サブスクリストにおける個人情報の取り扱い方針を説明します。",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950">
      <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <Link href="/" className="text-sm font-bold text-blue-700">
          サブスクリスト
        </Link>
        <h1 className="mt-4 text-3xl font-black">プライバシーポリシー</h1>
        <div className="mt-6 space-y-5 text-sm leading-7 text-slate-700">
          <p>
            サブスクリストは、固定費やサブスクリプションの管理を支援するために、
            ユーザーが登録した情報を必要な範囲で取り扱います。
          </p>
          <p>
            取得する情報には、アカウント情報、登録されたサービス情報、
            支払い履歴、通知に必要な連絡先情報などが含まれます。
          </p>
          <p>
            これらの情報は、サービス提供、本人確認、通知、利便性向上、
            不正利用防止、法令対応のために利用します。
          </p>
          <p>
            当サービスは、法令に基づく場合を除き、本人の同意なく個人情報を
            第三者へ提供しません。
          </p>
          <p>
            個人情報の確認、修正、削除、利用停止に関するお問い合わせは、
            サービス運営者までご連絡ください。
          </p>
        </div>
      </div>
    </main>
  );
}
