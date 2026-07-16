import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/app-shell";
import { PwaInstallButton } from "@/components/public-views";
import { buildPageMetadata } from "@/lib/seo";
import { publicLinks, siteConfig } from "@/lib/site";

const features = [
  ["更新日を見逃さない", "7日前、3日前、前日、当日の通知設計で固定費の見直しタイミングを逃しません。"],
  ["支出をすぐ把握", "月額換算、年額換算、カテゴリ別、支払い方法別の集計を自動で整理します。"],
  ["Freeから始められる", "10件まで無料。Premiumは月額480円で使えます。"],
];

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: siteConfig.name,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: siteConfig.description,
  url: siteConfig.url,
  offers: {
    "@type": "Offer",
    price: "480",
    priceCurrency: "JPY",
  },
};

export const metadata = buildPageMetadata({
  title: siteConfig.name,
  description: siteConfig.description,
  path: "/",
});

export default function Home() {
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
              サブスクビジネスを、もっと自由に。
            </h1>
            <p className="mt-6 text-lg leading-8 text-slate-600">
              契約、支払い、更新日、分析を一元管理。Freeで始めて、必要になったら月額480円のPremiumへ切り替えられます。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className="rounded-full bg-gradient-to-r from-blue-600 to-fuchsia-500 px-7 py-4 text-center font-bold text-white shadow-lg shadow-blue-200">
                今すぐはじめる
              </Link>
              <Link href="/pricing" className="rounded-full border border-slate-200 px-7 py-4 text-center font-bold text-slate-800">
                料金を見る
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <PwaInstallButton />
              <span>・</span>
              <Link href="/faq" className="font-medium text-slate-700 hover:text-slate-950">
                FAQ
              </Link>
              <span>・</span>
              <Link href="/contact" className="font-medium text-slate-700 hover:text-slate-950">
                お問い合わせ
              </Link>
            </div>
          </div>
          <div className="relative min-h-[430px] lg:min-h-[620px]">
            <Image
              src="/hero-subsclist.svg"
              alt="サブスクリストのトップページビジュアル"
              fill
              unoptimized
              priority
              className="object-contain object-center"
              sizes="(min-width: 1024px) 58vw, 100vw"
            />
          </div>
        </div>
        <div className="relative h-8 bg-[#f5f8ff]" />
      </section>

      <section className="bg-[#f5f8ff] px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-bold text-blue-700">課題提起</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">増え続ける固定費を、事業判断できる情報へ。</h2>
            <p className="mt-4 leading-7 text-slate-600">
              契約先、料金、更新日、支払い方法が分散すると、使っていないサービスにも気づきにくくなります。サブスクリストは、更新予定と支出構造を同じ画面で確認できる管理体験を提供します。
            </p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
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
            <p className="text-sm font-bold text-fuchsia-600">機能紹介</p>
            <h2 className="mt-2 text-3xl font-bold">管理、分析、メンテナンス制御まで。</h2>
            <p className="mt-4 leading-7 text-slate-600">
              サブスクCRUD、カテゴリ・支払い方法管理、分析、CSV、通知、メンテナンスモード、問い合わせ管理をまとめて扱えるようにしています。
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {["カード/テーブル表示", "カテゴリ別集計", "更新日カレンダー", "Free/Premium制御"].map((item) => (
              <div key={item} className="rounded-lg border border-slate-200 bg-white p-5 font-semibold shadow-sm">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-950 px-4 py-16 text-white sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-2">
          <Card className="border-white/10 bg-white/5 text-white">
            <h3 className="text-2xl font-bold">Free</h3>
            <p className="mt-2 text-4xl font-black">0円</p>
            <p className="mt-3 text-sm text-slate-300">10件まで登録、基本通知、基本集計。</p>
          </Card>
          <Card className="border-fuchsia-300/40 bg-white text-slate-950">
            <h3 className="text-2xl font-bold">Premium</h3>
            <p className="mt-2 text-4xl font-black">{siteConfig.premiumPriceLabel}</p>
            <p className="mt-2 text-sm font-semibold text-blue-700">月額プラン</p>
            <p className="mt-3 text-sm text-slate-600">登録無制限、CSV出力、高度分析、複数通知、管理者向け機能。</p>
          </Card>
        </div>
      </section>

      <section className="bg-[#f5f8ff] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4">
          {publicLinks.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:text-slate-950">
              {item.label}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
