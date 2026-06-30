"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/app-shell";

function AuthFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,#dbeafe_0%,transparent_34%),linear-gradient(135deg,#f8fafc_0%,#eef6ff_50%,#fdf2f8_100%)] px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-3 text-xl font-black">
          <span className="grid size-10 place-items-center rounded-lg bg-gradient-to-br from-blue-600 via-cyan-500 to-fuchsia-500 text-white shadow-lg shadow-blue-500/20">S</span>
          サブスクリスト
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
  const data = (await response.json().catch(() => ({ message: "サーバーでエラーが発生しました。" }))) as {
    message?: string;
    emailVerified?: boolean;
    mailSent?: boolean;
  };
  if (!response.ok && response.status !== 202) {
    throw new Error(data.message ?? "処理に失敗しました。");
  }
  return data;
}

export function LoginView() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!email || !password) return setError("メールアドレスとパスワードを入力してください。");
    if (!email.includes("@")) return setError("メールアドレスの形式を確認してください。");

    setLoading(true);
    try {
      const data = await postJson("/api/auth/login", { email, password });
      router.push(data.emailVerified ? "/dashboard" : "/verify-email");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ログインに失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame title="ログイン">
      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        <label className="grid gap-2 text-sm font-semibold">
          メールアドレス
          <input value={email} onChange={(e) => setEmail(e.target.value)} className="input" type="email" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          パスワード
          <input value={password} onChange={(e) => setPassword(e.target.value)} className="input" type="password" />
        </label>
        <button disabled={loading} className="btn-primary w-full">
          {loading ? "ログイン中..." : "ログイン"}
        </button>
      </form>

      <div className="mt-5 border-t border-slate-200 pt-5 text-center">
        <p className="text-sm text-slate-600">はじめて利用する方はこちら</p>
        <Link href="/register" className="btn-secondary mt-3 w-full">
          新規登録
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
    if (!name || !email || !password) return setError("名前、メールアドレス、パスワードを入力してください。");
    if (!email.includes("@")) return setError("メールアドレスの形式を確認してください。");
    if (password.length < 8) return setError("パスワードは8文字以上で入力してください。");

    setLoading(true);
    try {
      const data = await postJson("/api/auth/register", { name, email, password });
      if (data.message) setMessage(data.message);
      router.push(data.mailSent === false ? "/verify-email?mail=failed" : "/verify-email");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame title="新規登録">
      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        {message && <p className="rounded-lg bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</p>}
        <label className="grid gap-2 text-sm font-semibold">
          名前
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" maxLength={100} />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          メールアドレス
          <input value={email} onChange={(e) => setEmail(e.target.value)} className="input" type="email" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          パスワード
          <input value={password} onChange={(e) => setPassword(e.target.value)} className="input" type="password" />
        </label>
        <button disabled={loading} className="btn-primary w-full">
          {loading ? "登録中..." : "登録して認証メールを送信"}
        </button>
      </form>

      <div className="mt-5 border-t border-slate-200 pt-5 text-center">
        <p className="text-sm text-slate-600">既に登録済みの方はこちら</p>
        <Link href="/login" className="btn-secondary mt-3 w-full">
          ログイン
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
      setMessage(data.message ?? "認証メールを再送しました。");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "再送に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <button onClick={resend} disabled={loading} className="btn-primary w-full">
        {loading ? "送信中..." : "認証メールを再送する"}
      </button>
      {message && <p className="mt-3 text-sm font-semibold text-slate-700">{message}</p>}
    </div>
  );
}

export function PricingView() {
  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f8fafc_0%,#eef6ff_52%,#fdf2f8_100%)] px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="font-bold text-blue-700">トップへ戻る</Link>
        <h1 className="mt-8 text-4xl font-black">料金プラン</h1>
        <p className="mt-3 text-slate-600">Freeで始めて、必要になったらPremiumへ。Premiumは月額480円です。</p>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <Card>
            <h2 className="text-2xl font-bold">Free</h2>
            <p className="mt-2 text-4xl font-black">0円</p>
            <ul className="mt-5 space-y-2 text-sm text-slate-600">
              <li>サブスク10件まで表示・管理</li>
              <li>カテゴリ5件まで</li>
              <li>基本ダッシュボード、一覧、カレンダー、通知確認</li>
              <li>CSV、AI、高度分析、解約支援は利用不可</li>
            </ul>
          </Card>
          <Card className="border-blue-400">
            <h2 className="text-2xl font-bold">Premium</h2>
            <p className="mt-2 text-4xl font-black">480円/月</p>
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
