import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950">
      <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <Link href="/" className="text-sm font-bold text-blue-700">サブスクリスト</Link>
        <h1 className="mt-4 text-3xl font-black">プライバシーポリシー</h1>
        <div className="mt-6 space-y-5 text-sm leading-7 text-slate-700">
          <p>サブスクリストは、サブスクリプション管理に必要な範囲で、メールアドレス、表示名、登録した契約情報、支払い履歴、設定情報を保存します。</p>
          <p>登録データはユーザーごとに分離し、本人の管理画面、通知、分析、CSV入出力、見直し候補の表示のために利用します。</p>
          <p>パスワードはハッシュ化して保存します。メール送信にはSMTP設定を利用し、メール認証や通知に必要な情報のみを送信します。</p>
          <p>ユーザーは、不要になったデータの削除を依頼できます。法令上保存が必要な場合を除き、合理的な範囲で削除します。</p>
        </div>
      </div>
    </main>
  );
}
