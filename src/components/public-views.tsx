"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/app-shell";
import { useStore } from "@/components/store";
import { publicLinks, siteConfig } from "@/lib/site";
import { findNgWord } from "@/lib/security";
import { z } from "zod";

type FrameProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

export function PublicFrame({ title, description, children }: FrameProps) {
  const { siteSettings, user } = useStore();

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3 text-lg font-black">
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white">
              S
            </span>
            {siteConfig.name}
          </Link>
          <nav className="hidden flex-wrap gap-4 text-sm font-medium text-slate-600 md:flex">
            {publicLinks.slice(0, 4).map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-slate-950">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        {siteSettings.maintenanceMode && user.role !== "admin" && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-amber-900">
            現在、管理画面はメンテナンス中です。公開ページは閲覧できます。
          </div>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-blue-700">SubscList</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">{description}</p>
        </div>
        <div className="mt-8 space-y-5">{children}</div>
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 text-sm text-slate-600 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {publicLinks.map((item) => (
              <Link key={item.href} href={item.href} className="font-medium hover:text-slate-950">
                {item.label}
              </Link>
            ))}
          </div>
          <PwaInstallButton />
        </div>
      </footer>
    </div>
  );
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function PwaInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  return (
    <button
      onClick={async () => {
        if (!deferredPrompt) return;
        await deferredPrompt.prompt();
        setDeferredPrompt(null);
      }}
      disabled={!deferredPrompt}
      className="rounded-full border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
    >
      アプリを追加
    </button>
  );
}

function MaintenanceCard() {
  return (
    <Card className="mx-auto max-w-2xl border-amber-200 bg-amber-50">
      <p className="text-sm font-semibold text-amber-800">メンテナンス中</p>
      <h2 className="mt-2 text-2xl font-black">一般ユーザー向け画面は一時停止しています。</h2>
      <p className="mt-3 text-sm leading-7 text-amber-900">
        管理者はログイン後に管理画面へ進めます。公開ページはこのまま閲覧できます。
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/login" className="rounded-lg bg-amber-600 px-4 py-3 font-bold text-white">
          ログインへ
        </Link>
        <Link href="/" className="rounded-lg border border-amber-300 px-4 py-3 font-bold text-amber-800">
          トップへ
        </Link>
      </div>
    </Card>
  );
}

export function MaintenanceView() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f7f9fc] px-4 py-10">
      <MaintenanceCard />
    </div>
  );
}

const contactSchema = z.object({
  name: z.string().trim().min(1, "名前を入力してください。").max(80, "名前は80文字以内です。"),
  email: z.string().trim().email("メールアドレスの形式を確認してください。"),
  category: z.enum(["general", "billing", "feature", "bug", "admin", "other"]),
  subject: z.string().trim().min(1, "件名を入力してください。").max(120, "件名は120文字以内です。"),
  body: z.string().trim().min(10, "本文は10文字以上で入力してください。").max(2000, "本文は2000文字以内です。"),
});

const contactCategoryLabels: Record<string, string> = {
  general: "一般",
  billing: "プラン/支払い",
  feature: "機能要望",
  bug: "不具合",
  admin: "管理者向け",
  other: "その他",
};

export function FaqView() {
  return (
    <PublicFrame title="FAQ" description="利用開始、プラン、メンテナンス、データの保存先など、よくある質問をまとめています。">
      <div className="grid gap-4">
        {[
          ["FreeとPremiumの違いは？", `Freeはサブスク10件までです。Premiumは${siteConfig.premiumPriceLabel}の有料プランで、登録上限の拡張、CSV出力、高度分析、複数通知が使えます。`],
          ["データはどこに保存されますか？", "このデモ実装では、アカウント情報やサブスク情報、問い合わせ内容はブラウザの localStorage に保存されます。"],
          ["メンテナンス中はどうなりますか？", "一般ユーザーはメンテナンス画面に誘導されます。管理者だけが管理画面に入れます。"],
          ["お問い合わせはどこに送られますか？", "お問い合わせフォームから送った内容は管理画面の問い合わせ一覧に保存され、管理者が確認します。"],
          ["検索エンジンに見せるページはありますか？", "トップ、料金、FAQ、お問い合わせ、利用規約、プライバシー、特定商取引法のページを公開対象にしています。"],
        ].map(([question, answer]) => (
          <Card key={question}>
            <h2 className="text-lg font-bold">{question}</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">{answer}</p>
          </Card>
        ))}
      </div>
    </PublicFrame>
  );
}

export function ContactView() {
  const { saveContactMessage } = useStore();
  const [form, setForm] = useState({
    name: "",
    email: "",
    category: "general" as const,
    subject: "",
    body: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    const parsed = contactSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
      return;
    }

    const blockedWord = findNgWord(`${parsed.data.subject}\n${parsed.data.body}`);
    const payload = {
      id: `contact-${crypto.randomUUID()}`,
      name: parsed.data.name,
      email: parsed.data.email,
      category: parsed.data.category,
      subject: parsed.data.subject,
      body: parsed.data.body,
      createdAt: new Date().toISOString(),
      status: blockedWord ? ("blocked" as const) : ("new" as const),
      blocked: Boolean(blockedWord),
    };

    saveContactMessage(payload);
    if (blockedWord) {
      setError(`NGワード「${blockedWord}」が含まれているため送信を止めました。`);
      return;
    }

    setForm({ name: "", email: "", category: "general", subject: "", body: "" });
    setMessage("お問い合わせを受け付けました。管理画面で確認されます。");
  }

  return (
    <PublicFrame title="お問い合わせ" description="機能要望、不具合、料金に関する相談はこちらから送信できます。NGワードは送信前に判定します。">
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <p className="text-sm leading-7 text-slate-600">
            送信内容は管理画面に保存されます。メール送信は行わず、管理者が内容を確認して対応します。
          </p>
          <p className="mt-4 text-sm leading-7 text-slate-600">
            事業用の連絡先や受付手段を追加する場合は、ここに差し替えられるように設計しています。
          </p>
        </Card>
        <Card>
          <form onSubmit={submit} className="space-y-4">
            {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
            {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p>}
            <label className="grid gap-2 text-sm font-semibold">
              お名前
              <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="input" maxLength={80} />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              メールアドレス
              <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="input" type="email" />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              種別
              <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as typeof form.category }))} className="input">
                {Object.entries(contactCategoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              件名
              <input value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} className="input" maxLength={120} />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              本文
              <textarea value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} className="input min-h-40" maxLength={2000} />
            </label>
            <button className="rounded-lg bg-blue-600 px-5 py-3 font-bold text-white">送信する</button>
          </form>
        </Card>
      </div>
    </PublicFrame>
  );
}

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-slate-600">{children}</div>
    </Card>
  );
}

export function TermsView() {
  return (
    <PublicFrame title="利用規約" description="サブスクリプションの見える化と運用を支えるための利用条件です。">
      <LegalSection title="1. サービスの目的">
        <p>サブスクリストは、サブスクの契約状況、更新日、支払い方法、解約検討を整理するための管理ツールです。</p>
      </LegalSection>
      <LegalSection title="2. アカウント">
        <p>アカウント情報はブラウザに保存されます。共有端末ではログアウトとブラウザデータの管理に注意してください。</p>
      </LegalSection>
      <LegalSection title="3. プラン">
        <p>Free はサブスク10件までです。Premium は{siteConfig.premiumPriceLabel}の有料プランで、登録上限の拡張や高度機能が使えます。</p>
      </LegalSection>
      <LegalSection title="4. 禁止事項">
        <p>不正アクセス、虚偽登録、スパム送信、システム負荷を意図した操作、他者の情報を無断で登録する行為は禁止します。</p>
      </LegalSection>
      <LegalSection title="5. データ">
        <p>この実装では、保存データはブラウザの localStorage に保持されます。端末変更やデータ削除で消える場合があります。</p>
      </LegalSection>
      <LegalSection title="6. 規約変更">
        <p>機能追加や法令対応に応じて、本規約は更新されることがあります。更新後は最新の内容が優先されます。</p>
      </LegalSection>
    </PublicFrame>
  );
}

export function PrivacyView() {
  return (
    <PublicFrame title="プライバシーポリシー" description="この実装で扱うデータの保存先、利用目的、取り扱い範囲を説明します。">
      <LegalSection title="保存する情報">
        <p>アカウント名、メールアドレス、プラン、メール認証状態、サブスク情報、問い合わせ内容をブラウザ内に保存します。</p>
      </LegalSection>
      <LegalSection title="利用目的">
        <p>ログイン状態の維持、サブスク管理、通知、分析、問い合わせ管理のために利用します。</p>
      </LegalSection>
      <LegalSection title="第三者提供">
        <p>このデモ実装では、保存データを外部サービスへ送信しません。PWA のための Service Worker は静的ファイルのキャッシュに使います。</p>
      </LegalSection>
      <LegalSection title="問い合わせ">
        <p>お問い合わせフォームの内容は管理画面に保存されます。運用時は保存先や保管期間を追加で定めてください。</p>
      </LegalSection>
      <LegalSection title="利用者側の管理">
        <p>ブラウザの localStorage を削除するとデータは消えます。共有端末では定期的に保存状態を確認してください。</p>
      </LegalSection>
    </PublicFrame>
  );
}

export function TokushohoView() {
  return (
    <PublicFrame title="特定商取引法に基づく表記" description="デジタルサービスとしての販売条件をまとめています。公開時は事業者情報に差し替えてください。">
      <LegalSection title="販売価格">
        <p>Premium は{siteConfig.premiumPriceLabel}です。Free は無料です。</p>
      </LegalSection>
      <LegalSection title="支払方法">
        <p>クレジットカード決済を想定しています。実際の決済方法は販売時の設定に従って表示してください。</p>
      </LegalSection>
      <LegalSection title="提供時期">
        <p>購入後、利用可能な状態になります。アカウント作成後はすぐにサブスク管理を開始できます。</p>
      </LegalSection>
      <LegalSection title="返品・キャンセル">
        <p>デジタルサービスの性質上、提供後の返品は原則できません。法令や販売条件に応じて別途定めてください。</p>
      </LegalSection>
      <LegalSection title="問い合わせ先">
        <p>お問い合わせフォームまたは管理画面の問い合わせ一覧から連絡できます。</p>
      </LegalSection>
    </PublicFrame>
  );
}
