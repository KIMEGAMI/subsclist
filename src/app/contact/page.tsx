import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/app-shell";
import { ContactForm } from "@/components/contact-form";
import { SYSTEM_EMAIL_ADDRESS } from "@/lib/app-constants";

export const metadata: Metadata = {
  title: "お問い合わせ | SubscList",
  description: "SubscListへのお問い合わせを送信できます。",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="text-sm font-bold text-blue-700">SubscList</Link>
        <Card className="mt-4">
          <h1 className="text-3xl font-black">お問い合わせ</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            サービス内容、決済、アカウント、その他のご相談はこちらから送信してください。送信内容は {SYSTEM_EMAIL_ADDRESS} に届きます。
          </p>
          <div className="mt-6">
            <ContactForm />
          </div>
        </Card>
      </div>
    </main>
  );
}
