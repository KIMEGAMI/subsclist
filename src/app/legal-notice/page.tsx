import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記 | SubscList",
  description: "SubscListの有料プラン提供に関する販売条件、支払い方法、解約方法などを表示します。",
  alternates: { canonical: "/legal-notice" },
};

const rows = [
  ["販売事業者", "SubscList 運営者"],
  ["運営責任者", "Shinji"],
  ["所在地", "請求があった場合、法令に基づき遅滞なく開示します。"],
  ["電話番号", "請求があった場合、法令に基づき遅滞なく開示します。"],
  ["メールアドレス", "saas.system.shinji@gmail.com"],
  ["販売URL", "https://subsclist.shinji.work"],
  ["販売価格", "Premiumプラン 月額480円（税込）"],
  ["商品代金以外の必要料金", "インターネット接続料金、通信料金、振込手数料その他の利用環境に応じた費用はお客様の負担となります。"],
  ["支払い方法", "クレジットカード決済（Stripe Checkout）"],
  ["支払い時期", "Premiumプラン申込時に初回決済が行われ、以後は契約更新日に自動で決済されます。"],
  ["サービス提供時期", "決済完了後、システム上でPremiumプランが有効化された時点から利用できます。"],
  ["返品・キャンセル", "デジタルサービスの性質上、決済完了後の返金は原則としてお受けしていません。ただし、本サービス側の重大な不具合などがある場合は個別に確認します。"],
  ["解約方法", "ログイン後の設定画面、またはStripeのカスタマーポータルから解約できます。解約後は次回更新日以降の請求が停止されます。"],
  ["動作環境", "最新バージョンの主要ブラウザ（Chrome、Edge、Safari、Firefox）での利用を推奨します。"],
  ["注意事項", "本サービスはサブスクリプションや固定費の管理を支援するツールです。削減額、解約可否、通知の到達、各サービス提供会社の契約条件を保証するものではありません。"],
] as const;

export default function LegalNoticePage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm font-bold text-blue-700">SubscList</Link>
        <section className="mt-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-black text-blue-700">Legal Notice</p>
          <h1 className="mt-3 text-3xl font-black">特定商取引法に基づく表記</h1>
          <p className="mt-4 text-sm leading-7 text-slate-600">
            SubscListの有料プラン提供に関する表示です。内容はサービス運営状況や法令改正に応じて更新される場合があります。
          </p>
          <div className="mt-8 overflow-hidden rounded-lg border border-slate-200">
            <dl className="divide-y divide-slate-200">
              {rows.map(([label, value]) => (
                <div key={label} className="grid gap-2 bg-white p-4 sm:grid-cols-[220px_1fr]">
                  <dt className="text-sm font-black text-slate-800">{label}</dt>
                  <dd className="text-sm leading-7 text-slate-600">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="mt-6 text-xs leading-6 text-slate-500">
            所在地および電話番号について開示請求がある場合は、上記メールアドレス宛にご連絡ください。請求者の本人確認および取引内容の確認後、法令に基づき遅滞なく提供します。
          </p>
        </section>
      </div>
    </main>
  );
}

