import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950">
      <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <Link href="/" className="text-sm font-bold text-blue-700">サブスクリスト</Link>
        <h1 className="mt-4 text-3xl font-black">利用規約</h1>
        <div className="mt-6 space-y-5 text-sm leading-7 text-slate-700">
          <p>本サービスは、サブスクリプション契約、更新日、支払い履歴、見直し候補を管理するための補助ツールです。</p>
          <p>更新日、解約期限、通知、見直し候補、削減見込みは、登録情報をもとにした参考情報です。実際の契約内容、請求、解約可否は各サービス提供元の条件を確認してください。</p>
          <p>ユーザーは、登録内容が正確になるよう管理するものとします。誤入力や通知未達による損害について、当サービスは法令で認められる範囲で責任を負いません。</p>
          <p>有料プランの内容、料金、提供範囲は、サービス改善のため変更される場合があります。</p>
        </div>
      </div>
    </main>
  );
}
