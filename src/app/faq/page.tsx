import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "よくある質問 | SubscList",
  description: "SubscListの料金、メール認証、CSV、通知、アカウント削除についてのよくある質問です。",
  alternates: { canonical: "/faq" },
};

const questions = [
  { question: "利用料金はいくらですか？", answer: "現在はポートフォリオ用の無料公開版として提供しています。登録数の上限はなく、分析、CSV、通知、解約支援を含む全機能を利用できます。新規の有料契約受付は停止しています。" },
  { question: "メール認証が届かない場合はどうすればよいですか？", answer: "迷惑メールフォルダを確認し、登録したメールアドレスが正しいか確認してください。認証画面から確認メールを再送できます。" },
  { question: "以前のStripe契約は無料化で自動解約されますか？", answer: "いいえ。無料化で過去のStripe契約は自動解約されません。設定画面にStripe契約管理リンクが表示される場合は、契約と継続請求を確認し、必要ならStripe側で解約してください。" },
  { question: "クレジットカードを登録する必要はありますか？", answer: "本サービスの利用にカード登録は必要ありません。過去のStripe契約が残っている場合は、設定画面から契約状態をご確認ください。" },
  { question: "登録できるサブスク数に上限はありますか？", answer: "ありません。現在は全アカウントで登録数やカテゴリ数の制限を解除しています。" },
  { question: "CSVを取り込む時の注意点はありますか？", answer: "サンプルCSVと項目説明を確認してください。1行目をヘッダーにする形式と、ヘッダーなしの形式の両方に対応しています。支払い方法は、あらかじめ登録済みのStripe対応項目を指定します。" },
  { question: "アカウントを削除するとどうなりますか？", answer: "設定画面から削除できます。過去のStripe契約が継続中の場合は、先にStripeの契約管理画面で解約を完了してください。削除を実行すると、サブスク、支払い履歴、通知設定などのアカウントデータは完全に削除され、元に戻せません。" },
] as const;

export default function FaqPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })),
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-bold text-blue-700">SubscList トップへ</Link>
        <h1 className="mt-4 text-3xl font-black">よくある質問</h1>
        <div className="mt-8 space-y-3">
          {questions.map((item) => (
            <details key={item.question} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <summary className="cursor-pointer font-bold text-slate-900">{item.question}</summary>
              <p className="mt-4 text-sm leading-7 text-slate-700">{item.answer}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-sm text-slate-600">解決しない場合は <Link href="/contact" className="font-bold text-blue-700">お問い合わせ</Link> からご連絡ください。</p>
      </div>
    </main>
  );
}
