import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/app-shell";
import { DemoLoginButton } from "@/components/demo-login-button";

const features = [
  ["削減見込みを表示", "利用頻度、重要度、AI診断をもとに、月額・年額でどれだけ削減できるかを確認できます。"],
  ["解約まで支援", "検討中、解約予定、申請済み、完了までを記録し、解約URLやメモを一緒に管理できます。"],
  ["CSVから取り込める", "カード明細や既存の管理表から取り込み、手入力の負担を減らします。"],
  ["運用スコアで判断", "期限リスク、予算、見直し状況、データ充実度をまとめて、今月の優先対応を表示します。"],
];

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
              サブスクビジネスを、もっと自由に。
            </h1>
            <p className="mt-6 text-lg leading-8 text-slate-600">
              契約、課金、更新日、支出分析を一元管理。不要な契約の見直しと、毎月の固定費管理を支援します。
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
            <Image
              src="/hero-subsclist.png"
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
            <h2 className="mt-2 text-3xl font-bold tracking-tight">増え続ける固定費を、判断できる情報へ。</h2>
            <p className="mt-4 leading-7 text-slate-600">
              契約先、料金、更新日、支払い方法が分散すると、使っていないサービスにも気づきにくくなります。サブスクリストは、更新予定と支出構造を同じ画面で確認できる管理体験を提供します。
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
            <p className="text-sm font-bold text-fuchsia-600">機能紹介</p>
            <h2 className="mt-2 text-3xl font-bold">管理、分析、課金制御まで。</h2>
            <p className="mt-4 leading-7 text-slate-600">
              サブスクCRUD、カテゴリ・支払い方法管理、分析、CSV入出力、予算管理、見直しスコア、解約支援、AI提案に対応します。認証後のデータはユーザーごとにDBで分離します。
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {["削減シミュレーション", "見直しスコア", "解約支援", "CSVインポート"].map((item) => (
              <div key={item} className="rounded-lg border border-slate-100 bg-white p-5 font-bold shadow-[0_12px_30px_rgba(15,23,42,0.07)]">{item}</div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-950 px-4 py-16 text-white sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-2">
          <Card className="border-white/10 bg-white/5 text-white">
            <h3 className="text-2xl font-bold">Free</h3>
            <p className="mt-2 text-4xl font-black">お試し</p>
            <p className="mt-3 text-sm text-slate-300">10件まで登録、基本通知、基本集計。</p>
          </Card>
          <Card className="border-fuchsia-300/40 bg-white text-slate-950">
            <h3 className="text-2xl font-bold">Premium</h3>
            <p className="mt-2 text-4xl font-black">買い切り480円</p>
            <p className="mt-2 text-sm font-bold text-blue-700">一度の購入でPremium機能を利用できます。</p>
            <p className="mt-3 text-sm text-slate-600">登録無制限、CSV入出力、CSV明細候補検出、高度分析、支払い累計、見直しレポート、AI診断、解約支援。</p>
          </Card>
        </div>
        <div className="mx-auto mt-8 flex max-w-7xl flex-wrap gap-4 text-sm font-bold text-slate-300">
          <Link href="/privacy" className="hover:text-white">プライバシーポリシー</Link>
          <Link href="/terms" className="hover:text-white">利用規約</Link>
          <Link href="/security" className="hover:text-white">セキュリティ</Link>
        </div>
      </section>
    </main>
  );
}
