import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/app-shell";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = {
  title: "お問い合わせ | SubscList",
  description: "SubscListへのお問い合わせを送信できます。",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const params = await searchParams;
  const returnHref = params.returnTo === "dashboard" ? "/dashboard" : "/";
  const returnLabel = returnHref === "/dashboard" ? "ダッシュボード" : "トップページ";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950">
      <div className="mx-auto max-w-2xl">
        <Link href={returnHref} className="text-sm font-bold text-blue-700">SubscList</Link>
        <Card className="mt-4">
          <h1 className="text-3xl font-black">お問い合わせ</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            サービス内容、決済、アカウント、その他のご相談はこちらから送信してください。
          </p>
          <div className="mt-6">
            <ContactForm returnHref={returnHref} returnLabel={returnLabel} />
          </div>
        </Card>
      </div>
    </main>
  );
}
