import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/app-shell";
import { DemoLoginButton } from "@/components/demo-login-button";
import { FREE_SUBSCRIPTION_LIMIT, PREMIUM_MONTHLY_PRICE_YEN, STRIPE_TRIAL_PERIOD_DAYS } from "@/lib/app-constants";

export const metadata: Metadata = {
  title: { absolute: "SubscList | サブスクリプション管理システム" },
  description:
    "フリーランス・副業者・個人事業主の継続課金を一元管理。更新日、仕事利用分、見直し候補を整理し、毎月の判断を早くします。",
  alternates: { canonical: "/" },
  openGraph: {
    title: "SubscList | サブスクリプション管理システム",
    description:
      "仕事と個人の継続課金を分け、更新・見直し・経費整理を続けられる管理サービスです。",
    url: "/",
  },
};

const features = [
  ["仕事利用分を整理", "契約ごとの仕事利用割合から、毎月・年間の仕事利用分を見積もれます。"],
  ["更新判断を支援", "金額、利用頻度、重要度、更新時期から、今月見るべき契約を整理します。"],
  ["台帳をCSVで共有", "既存の管理表を取り込み、仕事利用分を含む契約台帳を出力できます。"],
  ["期限と解約を管理", "無料期間、更新日、解約期限、手順、証跡を一つの流れで管理できます。"],
] as const;

export default function Home() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "SubscList",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    description:
      "フリーランス・副業者・個人事業主の契約、更新日、仕事利用分、見直し候補をまとめて管理するサービスです。",
    offers: [
      { "@type": "Offer", name: "Free", price: "0", priceCurrency: "JPY" },
      {
        "@type": "Offer",
        name: "Premium",
        price: String(PREMIUM_MONTHLY_PRICE_YEN),
        priceCurrency: "JPY",
        billingDuration: "P1M",
        description: `初回のみ${STRIPE_TRIAL_PERIOD_DAYS}日間お試し無料`,
      },
    ],
  };

  return (
    <main className="bg-white text-slate-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#ffffff_0%,#f5f8ff_100%)]" />
        <div className="relative mx-auto grid min-h-[92vh] max-w-7xl items-center gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8">
          <div className="z-10 max-w-xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm">
              <span className="size-2 rounded-full bg-fuchsia-500" />
              サブスクリプション管理システム
            </div>
            <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-6xl">
              仕事のサブスクを、判断できる台帳へ。
            </h1>
            <p className="mt-6 text-lg leading-8 text-slate-600">
              SaaSやAI、クラウドが増えたフリーランス・副業者・個人事業主へ。仕事利用分、更新日、利用実績、解約期限を一元化し、月末の整理と継続判断を早くします。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/login" className="rounded-full bg-gradient-to-r from-blue-600 via-cyan-500 to-fuchsia-500 px-7 py-4 text-center font-black text-white shadow-lg shadow-blue-200 transition hover:-translate-y-0.5 hover:shadow-xl">
                今すぐはじめる
              </Link>
              <DemoLoginButton />
              <Link href="/pricing" className="rounded-full border border-slate-200 bg-white/85 px-7 py-4 text-center font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-700">
                料金を見る
              </Link>
            </div>
            <p className="mt-5 text-sm font-bold text-blue-700">
              Premiumは初回のみ{STRIPE_TRIAL_PERIOD_DAYS}日間お試し無料。無料期間中に解約すれば料金はかかりません。
            </p>
          </div>
          <div className="relative min-h-[430px] lg:min-h-[620px]">
            <Image src="/hero-subsclist.png" alt="SubscListの画面イメージ" fill unoptimized priority className="object-contain object-center" sizes="(min-width: 1024px) 58vw, 100vw" />
          </div>
        </div>
        <div className="relative h-8 bg-[#f5f8ff]" />
      </section>

      <section className="bg-[#f5f8ff] px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-bold text-blue-700">継続課金の仕事台帳</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">確定申告前に探すのではなく、毎月整える</h2>
            <p className="mt-4 leading-7 text-slate-600">
              仕事用と個人用が混ざったカード明細、更新日が違うSaaS、残すか迷うAIサービス。SubscListは、契約ごとの仕事利用割合と利用状況を記録し、更新前に判断できる状態をつくります。
            </p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {features.map(([title, body]) => (
              <Card key={title}>
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm font-bold text-fuchsia-600">主な機能</p>
            <h2 className="mt-2 text-3xl font-bold">登録して終わらない、毎月の見直しまで</h2>
            <p className="mt-4 leading-7 text-slate-600">
              契約台帳、支払い累計、仕事利用分、更新カレンダー、利用実績、見直しレポート、解約支援を一つの流れで使えます。
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {["仕事利用分の集計", "更新・見直しスコア", "解約支援と証跡", "CSV入出力"].map((item) => (
              <div key={item} className="rounded-lg border border-slate-100 bg-white p-5 font-bold shadow-[0_12px_30px_rgba(15,23,42,0.07)]">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-950 px-4 py-16 text-white sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-2">
          <Card className="border-slate-200 bg-white text-slate-950">
            <h3 className="text-2xl font-bold">Free</h3>
            <p className="mt-2 text-4xl font-black">お試し</p>
            <p className="mt-3 text-sm text-slate-950">{FREE_SUBSCRIPTION_LIMIT}件まで登録、基本通知、基本集計を利用できます。</p>
          </Card>
          <Card className="border-fuchsia-300/40 bg-white text-slate-950">
            <h3 className="text-2xl font-bold">Premium</h3>
            <p className="mt-2 text-4xl font-black">月額{PREMIUM_MONTHLY_PRICE_YEN}円</p>
            <p className="mt-2 text-sm font-black text-blue-700">初回のみ{STRIPE_TRIAL_PERIOD_DAYS}日間お試し無料</p>
            <p className="mt-2 text-sm font-bold text-blue-700">まずは無料で、CSV・分析・解約支援までPremium機能を試せます。</p>
            <p className="mt-3 text-sm text-slate-600">登録無制限、CSV入出力、CSV明細候補検出、高度分析、支払い累計、見直しレポート、解約支援。</p>
          </Card>
        </div>
        <div className="mx-auto mt-8 flex max-w-7xl flex-wrap gap-4 text-sm font-bold text-slate-300">
          <Link href="/legal-notice" className="hover:text-white">特定商取引法に基づく表記</Link>
          <Link href="/privacy" className="hover:text-white">プライバシーポリシー</Link>
          <Link href="/terms" className="hover:text-white">利用規約</Link>
          <Link href="/faq" className="hover:text-white">よくある質問</Link>
          <Link href="/security" className="hover:text-white">セキュリティ</Link>
          <Link href="/contact" className="hover:text-white">お問い合わせ</Link>
        </div>
      </section>
    </main>
  );
}
