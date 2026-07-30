import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/app-shell";
import { DemoLoginButton } from "@/components/demo-login-button";

const features = [
  ["固定費を一覧化", "契約名、料金、更新日、解約期限、支払い履歴をまとめて確認できます。"],
  ["見直しを支援", "金額、利用頻度、更新時期をもとに、今月確認したい契約を見つけやすくします。"],
  ["CSVで取り込み", "カード明細や管理表から取り込み、手入力の負担を減らせます。"],
  ["通知と記録", "更新日や無料トライアル終了、解約期限の確認漏れを防ぎます。"],
] as const;

export default function Home() {
  return (
    <main className="bg-white text-slate-950">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#ffffff_0%,#f5f8ff_100%)]" />
        <div className="relative mx-auto grid min-h-[92vh] max-w-7xl items-center gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8">
          <div className="z-10 max-w-xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-2 text-sm font-semibold text-blue-700 shadow-sm">
              <span className="size-2 rounded-full bg-fuchsia-500" />
              サブスクリプション管理システム
            </div>
            <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-6xl">
              SubscListで固定費をわかりやすく管理
            </h1>
            <p className="mt-6 text-lg leading-8 text-slate-600">
              契約、課金、更新日、解約期限、支払い履歴を一元管理。毎月の固定費を把握し、不要な支出の見直しを支援します。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/login" className="rounded-full bg-gradient-to-r from-blue-600 via-cyan-500 to-fuchsia-500 px-7 py-4 text-center font-black text-white shadow-lg shadow-blue-200 transition hover:-translate-y-0.5 hover:shadow-xl">
                今すぐはじめる
              </Link>
              <DemoLoginButton />
              <Link href="/pricing" className="rounded-full border border-slate-200 bg-white/85 px-7 py-4 text-center font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-700">
                プランを見る
              </Link>
            </div>
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
            <p className="text-sm font-bold text-blue-700">管理の課題</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">増え続ける固定費を、判断できる情報へ</h2>
            <p className="mt-4 leading-7 text-slate-600">
              サービス名、料金、更新日、支払い方法が分散すると、使っていない契約に気づきにくくなります。SubscListは更新予定と支出状況を同じ画面で確認できる体験を提供します。
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
            <h2 className="mt-2 text-3xl font-bold">管理、分析、支払い履歴まで対応</h2>
            <p className="mt-4 leading-7 text-slate-600">
              サブスクCRUD、カテゴリ・支払い方法管理、CSV入出力、通知、支払い集計、見直しレポート、解約支援に対応します。
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {["契約管理", "見直しスコア", "解約支援", "CSVインポート"].map((item) => (
              <div key={item} className="rounded-lg border border-slate-100 bg-white p-5 font-bold shadow-[0_12px_30px_rgba(15,23,42,0.07)]">{item}</div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-950 px-4 py-16 text-white sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-2">
          <Card className="border-slate-200 bg-white text-slate-950">
            <h3 className="text-2xl font-bold">Free</h3>
            <p className="mt-2 text-4xl font-black">お試し</p>
            <p className="mt-3 text-sm text-slate-950">10件まで登録、基本通知、基本集計。</p>
          </Card>
          <Card className="border-fuchsia-300/40 bg-white text-slate-950">
            <h3 className="text-2xl font-bold">Premium</h3>
            <p className="mt-2 text-4xl font-black">月額480円</p>
            <p className="mt-2 text-sm font-bold text-blue-700">毎月の固定費としてPremium機能を利用できます。</p>
            <p className="mt-3 text-sm text-slate-600">登録無制限、CSV入出力、CSV明細候補検出、高度分析、支払い累計、見直しレポート、解約支援。</p>
          </Card>
        </div>
        <div className="mx-auto mt-8 flex max-w-7xl flex-wrap gap-4 text-sm font-bold text-slate-300">
          <Link href="/legal-notice" className="hover:text-white">特定商取引法に基づく表記</Link>
          <Link href="/privacy" className="hover:text-white">プライバシーポリシー</Link>
          <Link href="/terms" className="hover:text-white">利用規約</Link>
          <Link href="/security" className="hover:text-white">セキュリティ</Link>
        </div>
      </section>
    </main>
  );
}
