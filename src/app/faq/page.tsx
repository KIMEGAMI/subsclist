import type { Metadata } from "next";
import Link from "next/link";
import { FREE_CATEGORY_LIMIT, FREE_SUBSCRIPTION_LIMIT, PREMIUM_MONTHLY_PRICE_YEN, STRIPE_TRIAL_PERIOD_DAYS } from "@/lib/app-constants";

export const metadata: Metadata = {
  title: "よくある質問 | SubscList",
  description: "SubscListの料金、メール認証、CSV、通知、アカウント削除についてのよくある質問です。",
  alternates: { canonical: "/faq" },
};

const questions = [
  { question: `Premiumは${STRIPE_TRIAL_PERIOD_DAYS}日間無料で試せますか？`, answer: `はい。初回のみ${STRIPE_TRIAL_PERIOD_DAYS}日間お試し無料でPremium機能を利用できます。無料期間中に解約すれば料金はかかりません。無料期間終了後は月額${PREMIUM_MONTHLY_PRICE_YEN}円で自動更新されます。` },
  { question: "FreeとPremiumの違いは何ですか？", answer: `Freeではサブスク${FREE_SUBSCRIPTION_LIMIT}件、カテゴリ${FREE_CATEGORY_LIMIT}件までを管理できます。Premiumは初回のみ${STRIPE_TRIAL_PERIOD_DAYS}日間お試し無料で、その後は月額${PREMIUM_MONTHLY_PRICE_YEN}円です。登録数の上限がなくなり、CSV入出力、明細候補検出、高度な分析、月次レポート、解約支援を利用できます。` },
  { question: "メール認証が届かない場合はどうすればよいですか？", answer: "迷惑メールフォルダを確認し、登録したメールアドレスが正しいか確認してください。認証画面から確認メールを再送できます。" },
  { question: "登録したメールアドレスを変更できますか？", answer: "設定画面から新しいメールアドレスを入力すると、確認メールを送信します。メール内のリンクを開くまで、現在のメールアドレスは変更されません。Premium契約中は、認証完了後にStripeの請求先メールも更新します。" },
  { question: "クレジットカード番号は保存されますか？", answer: "保存しません。Premiumの決済はStripe Checkoutで処理され、SubscListはカード番号そのものを保持しません。" },
  { question: "Premiumを解約するにはどうすればよいですか？", answer: "ログイン後の「契約・解約」ページからStripeのカスタマーポータルを開き、そこで解約手続きを行えます。解約後も現在の請求期間が終了するまではPremium機能を利用できます。" },
  { question: "CSVを取り込む時の注意点はありますか？", answer: "サンプルCSVと項目説明を確認してください。1行目をヘッダーにする形式と、ヘッダーなしの形式の両方に対応しています。支払い方法は、あらかじめ登録済みのStripe対応項目を指定します。" },
  { question: "アカウントを削除するとどうなりますか？", answer: "設定画面から削除できます。Premium契約中は、先にStripeの契約管理画面で解約を完了する必要があります。削除を実行すると、サブスク、支払い履歴、通知設定などのアカウントデータは完全に削除され、元に戻せません。" },
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
