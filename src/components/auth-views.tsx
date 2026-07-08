"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/app-shell";
import { MAX_USER_NAME_LENGTH } from "@/lib/app-constants";

const t = {
  brand: "サブスクリスト",
  serverError: "サーバーでエラーが発生しました。",
  processFailed: "処理に失敗しました。",
  googleLogin: "Googleでログイン",
  googleConfig: "Googleログイン設定が未完了です。GOOGLE_CLIENT_ID と GOOGLE_CLIENT_SECRET を確認してください。",
  googleInvalid: "Googleログインの認証状態を確認できませんでした。もう一度お試しください。",
  googleFailed: "Googleログインに失敗しました。もう一度お試しください。",
  login: "ログイン",
  register: "新規登録",
  or: "または",
  email: "メールアドレス",
  password: "パスワード",
  name: "名前",
  loginLoading: "ログイン中...",
  registerLoading: "登録中...",
  loginFailed: "ログインに失敗しました。",
  registerFailed: "登録に失敗しました。",
  emailPasswordRequired: "メールアドレスとパスワードを入力してください。",
  invalidEmail: "メールアドレスの形式を確認してください。",
  registerRequired: "名前、メールアドレス、パスワードを入力してください。",
  passwordLength: "パスワードは8文字以上で入力してください。",
  firstTime: "はじめて利用する方はこちら",
  alreadyRegistered: "既に登録済みの方はこちら",
  registerAndSend: "登録して認証メールを送信",
  resendSuccess: "認証メールを再送しました。",
  resendFailed: "再送に失敗しました。",
  sending: "送信中...",
  resend: "認証メールを再送する",
  backTop: "トップへ戻る",
  pricingTitle: "料金プラン",
  pricingLead: "Freeで始めて、必要になったらPremiumへ。Premiumは買い切り480円で、本格運用に必要な分析、CSV、AI、解約支援をまとめて利用できます。",
};

function AuthFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,#dbeafe_0%,transparent_34%),linear-gradient(135deg,#f8fafc_0%,#eef6ff_50%,#fdf2f8_100%)] px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-3 text-xl font-black">
          <span className="grid size-10 place-items-center rounded-lg bg-gradient-to-br from-blue-600 via-cyan-500 to-fuchsia-500 text-white shadow-lg shadow-blue-500/20">S</span>
          {t.brand}
        </Link>
        <Card>
          <h1 className="text-2xl font-black">{title}</h1>
          {children}
        </Card>
      </div>
    </main>
  );
}

async function postJson(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => ({ message: t.serverError }))) as {
    message?: string;
    emailVerified?: boolean;
    mailSent?: boolean;
  };
  if (!response.ok && response.status !== 202) {
    throw new Error(data.message ?? t.processFailed);
  }
  return data;
}

function GoogleLoginButton() {
  return (
    <a href="/api/auth/google/start" className="mt-5 flex min-h-12 w-full items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/google-logo.png" alt="" className="size-5" />
      {t.googleLogin}
    </a>
  );
}

function GoogleLoginMessage({ status }: { status?: string }) {
  if (!status) return null;
  const message = status === "config" ? t.googleConfig : status === "invalid" ? t.googleInvalid : t.googleFailed;
  return <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{message}</p>;
}

export function LoginView({ googleStatus }: { googleStatus?: string } = {}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!email || !password) return setError(t.emailPasswordRequired);
    if (!email.includes("@")) return setError(t.invalidEmail);

    setLoading(true);
    try {
      const data = await postJson("/api/auth/login", { email, password });
      router.push(data.emailVerified ? "/dashboard" : "/verify-email");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.loginFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame title={t.login}>
      <GoogleLoginMessage status={googleStatus} />
      <GoogleLoginButton />
      <div className="my-5 flex items-center gap-3 text-xs font-bold text-slate-400"><span className="h-px flex-1 bg-slate-200" />{t.or}<span className="h-px flex-1 bg-slate-200" /></div>
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        <label className="grid gap-2 text-sm font-semibold">
          {t.email}
          <input value={email} onChange={(e) => setEmail(e.target.value)} className="input" type="email" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          {t.password}
          <input value={password} onChange={(e) => setPassword(e.target.value)} className="input" type="password" />
        </label>
        <button disabled={loading} className="btn-primary w-full">
          {loading ? t.loginLoading : t.login}
        </button>
      </form>

      <div className="mt-5 border-t border-slate-200 pt-5 text-center">
        <p className="text-sm text-slate-600">{t.firstTime}</p>
        <Link href="/register" className="btn-secondary mt-3 w-full">
          {t.register}
        </Link>
      </div>
    </AuthFrame>
  );
}

export function RegisterView() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!name || !email || !password) return setError(t.registerRequired);
    if (!email.includes("@")) return setError(t.invalidEmail);
    if (password.length < 8) return setError(t.passwordLength);

    setLoading(true);
    try {
      const data = await postJson("/api/auth/register", { name, email, password });
      if (data.message) setMessage(data.message);
      router.push(data.mailSent === false ? "/verify-email?mail=failed" : "/verify-email");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.registerFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame title={t.register}>
      <GoogleLoginButton />
      <div className="my-5 flex items-center gap-3 text-xs font-bold text-slate-400"><span className="h-px flex-1 bg-slate-200" />{t.or}<span className="h-px flex-1 bg-slate-200" /></div>
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        {message && <p className="rounded-lg bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</p>}
        <label className="grid gap-2 text-sm font-semibold">
          {t.name}
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" maxLength={MAX_USER_NAME_LENGTH} />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          {t.email}
          <input value={email} onChange={(e) => setEmail(e.target.value)} className="input" type="email" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          {t.password}
          <input value={password} onChange={(e) => setPassword(e.target.value)} className="input" type="password" />
        </label>
        <button disabled={loading} className="btn-primary w-full">
          {loading ? t.registerLoading : t.registerAndSend}
        </button>
      </form>

      <div className="mt-5 border-t border-slate-200 pt-5 text-center">
        <p className="text-sm text-slate-600">{t.alreadyRegistered}</p>
        <Link href="/login" className="btn-secondary mt-3 w-full">
          {t.login}
        </Link>
      </div>
    </AuthFrame>
  );
}

export function ResendVerificationButton() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function resend() {
    setMessage("");
    setLoading(true);
    try {
      const data = await postJson("/api/auth/resend-verification");
      setMessage(data.message ?? t.resendSuccess);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t.resendFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <button onClick={resend} disabled={loading} className="btn-primary w-full">
        {loading ? t.sending : t.resend}
      </button>
      {message && <p className="mt-3 text-sm font-semibold text-slate-700">{message}</p>}
    </div>
  );
}

export function PricingView() {
  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f8fafc_0%,#eef6ff_52%,#fdf2f8_100%)] px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="font-bold text-blue-700">{t.backTop}</Link>
        <h1 className="mt-8 text-4xl font-black">{t.pricingTitle}</h1>
        <p className="mt-3 text-slate-600">{t.pricingLead}</p>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <Card>
            <h2 className="text-2xl font-bold">Free</h2>
            <p className="mt-2 text-4xl font-black">お試し</p>
            <ul className="mt-5 space-y-2 text-sm text-slate-600">
              <li>サブスク10件まで表示・管理</li>
              <li>カテゴリ5件まで</li>
              <li>基本ダッシュボード、一覧、カレンダー、通知確認</li>
              <li>CSV、AI、高度分析、解約支援は利用不可</li>
            </ul>
          </Card>
          <Card className="border-blue-400">
            <h2 className="text-2xl font-bold">Premium</h2>
            <p className="mt-2 text-4xl font-black">買い切り480円</p>
            <p className="mt-2 text-sm font-semibold text-blue-700">一度の購入でPremium機能を利用できます。</p>
            <ul className="mt-5 space-y-2 text-sm text-slate-600">
              <li>サブスク登録・表示無制限</li>
              <li>CSV入出力、CSV明細候補検出</li>
              <li>高度分析、支払い累計、見直しレポート</li>
              <li>AI乗り換え診断、解約チェックリスト、証跡管理</li>
            </ul>
          </Card>
        </div>
      </div>
    </main>
  );
}
