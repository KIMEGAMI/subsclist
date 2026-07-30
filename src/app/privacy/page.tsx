import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "プライバシーポリシー | SubscList",
  description: "SubscListにおける個人情報の取り扱い方針を説明します。",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950">
      <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <Link href="/" className="text-sm font-bold text-blue-700">SubscList</Link>
        <h1 className="mt-4 text-3xl font-black">プライバシーポリシー</h1>
        <div className="mt-6 space-y-5 text-sm leading-7 text-slate-700">
          <p>SubscListは、サービス提供、本人確認、通知、課金管理、サポート対応のために、ユーザーが登録した氏名、メールアドレス、契約情報、支払い履歴、操作に必要な情報を取り扱います。</p>
          <p>取得した情報は、法令に基づく場合、決済処理やメール送信など業務委託に必要な場合、またはユーザーの同意がある場合を除き、第三者へ不適切に提供しません。</p>
          <p>パスワードは復元できない形式で保存し、決済情報はStripeなどの決済事業者が管理します。SubscListはクレジットカード番号そのものを保存しません。</p>
          <p>ユーザーは、登録情報の確認、変更、削除を求めることができます。お問い合わせは管理者メールアドレスまでご連絡ください。</p>
          <p>本ポリシーは、法令改正、サービス内容の変更、セキュリティ改善のために更新される場合があります。</p>
        </div>
      </div>
    </main>
  );
}
