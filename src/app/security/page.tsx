import Link from "next/link";

export default function SecurityPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950">
      <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <Link href="/" className="text-sm font-bold text-blue-700">サブスクリスト</Link>
        <h1 className="mt-4 text-3xl font-black">セキュリティ</h1>
        <div className="mt-6 space-y-5 text-sm leading-7 text-slate-700">
          <p>サブスクリストは、ログイン後のデータをユーザーIDで分離し、本人のデータだけを取得・更新します。</p>
          <p>パスワードは平文で保存せず、ハッシュ化して管理します。メール認証を通過したユーザーだけが管理画面を利用できます。</p>
          <p>DB接続情報、SMTPパスワード、APIキーなどの秘密情報は環境変数で管理し、画面やCSVには出力しません。</p>
          <p>見直し候補の表示は、選択したサブスク情報をもとに節約や代替候補を整理する機能です。機密性の高いメモや個人情報を入力しすぎない運用を推奨します。</p>
        </div>
      </div>
    </main>
  );
}
