import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "利用規約 | SubscList",
  description: "SubscListの利用条件を説明します。",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950">
      <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <Link href="/" className="text-sm font-bold text-blue-700">SubscList</Link>
        <h1 className="mt-4 text-3xl font-black">利用規約</h1>
        <div className="mt-6 space-y-5 text-sm leading-7 text-slate-700">
          <p>本規約は、SubscListの利用条件を定めるものです。ユーザーは、本規約とプライバシーポリシーに同意したうえで本サービスを利用します。</p>
          <p>本サービスは、サブスクリプション契約、更新日、支払い履歴、見直し候補を管理するための補助ツールです。実際の契約内容、請求、解約可否は各サービス提供者の条件を必ず確認してください。</p>
          <p>ユーザーは、登録情報を正確に管理し、不正アクセス、第三者へのアカウント貸与、法令または公序良俗に反する利用を行ってはなりません。</p>
          <p>本サービスは現在、ポートフォリオ用の無料公開版として提供し、新規の有料契約は受け付けていません。過去にStripeで契約した場合、その契約は本サービスの無料化によって自動解約されないため、ユーザー自身でStripeの契約状態と継続請求を確認するものとします。</p>
          <p>本サービスは、保守、障害対応、セキュリティ対応のため、一時的に全部または一部を停止する場合があります。</p>
        </div>
      </div>
    </main>
  );
}
