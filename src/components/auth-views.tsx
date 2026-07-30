"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/app-shell";
import { MAX_USER_NAME_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/app-constants";
import { userErrorMessage, userMessage } from "@/lib/error-messages";

const t = {
  brand: "SubscList",
  serverError: "サーバーでエラーが発生しました。",
  processFailed: "処理に失敗しました。",
  googleLogin: "Googleでログイン",
  googleConfig: "Googleログイン設定が未完了です。GOOGLE_CLIENT_ID と GOOGLE_CLIENT_SECRET を確認してください。",
  googleInvalid: "Googleログインの認証状態を確認できませんでした。もう一度お試しください。",
  googleFailed: "Googleログインに失敗しました。もう一度お試しください。",
  verificationNotice: "このメールアドレスは登録済みです。メール本文の認証リンクから続けてください。",
  verificationSendFailed: "認証メールの送信に失敗しました。メール認証画面またはログイン後に再送してください。",
  login: "ログイン",
  register: "新規登録",
  or: "または",
  email: "メールアドレス",
  password: "パスワード",
  confirmPassword: "パスワード（確認）",
  name: "名前",
  loginLoading: "ログイン中...",
  registerLoading: "登録中...",
  loginFailed: "ログインに失敗しました。",
  registerFailed: "登録に失敗しました。",
  emailPasswordRequired: "メールアドレスとパスワードを入力してください。",
  invalidEmail: "メールアドレスの形式を確認してください。",
  registerRequired: "名前、メールアドレス、パスワードを入力してください。",
  passwordLength: `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください。`,
  passwordMismatch: "パスワードが一致しません。",
  firstTime: "はじめて利用する方はこちら",
  alreadyRegistered: "既に登録済みの方はこちら",
  registerAndSend: "登録して認証メールを送信",
  resendSuccess: "認証メールを再送しました。",
  resendFailed: "再送に失敗しました。",
  sending: "送信中...",
  resend: "認証メールを再送する",
  backTop: "トップへ戻る",
  forgotPassword: "パスワードを忘れた方",
  forgotPasswordTitle: "パスワード再設定",
  forgotPasswordLead: "登録済みのメールアドレスを入力してください。再設定用URLを送信します。",
  resetPasswordTitle: "新しいパスワードを設定",
  resetPasswordLead: "メールに記載されたURLから、新しいパスワードを設定してください。",
  resetPassword: "パスワードを再設定",
  resetPasswordLoading: "再設定中...",
  resetPasswordSuccess: "パスワードを再設定しました。新しいパスワードでログインしてください。",
  missingResetToken: "再設定URLが無効です。もう一度パスワード再設定を行ってください。",
  termsRequired: "利用規約とプライバシーポリシーへの同意が必要です。",
  pricingTitle: "料金プラン",
  pricingLead: "Freeで始めて、必要になったらPremiumへ。Premiumは月額480円で、本格運用に必要な分析、CSV、解約支援をまとめて利用できます。",
};

type ApiResponse = {
  message?: string;
  emailVerified?: boolean;
  redirectTo?: string;
  mailSent?: boolean;
  alreadyRegistered?: boolean;
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
  const data = (await response.json().catch(() => ({ message: t.serverError }))) as ApiResponse;
  if (!response.ok && response.status !== 202) {
    throw new Error(userMessage(data.message, t.processFailed));
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

export function LoginView({ googleStatus, notice }: { googleStatus?: string; notice?: string } = {}) {
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
      router.push(data.redirectTo ?? (data.emailVerified ? "/dashboard" : "/verify-email"));
      router.refresh();
    } catch (err) {
      setError(userErrorMessage(err, t.loginFailed));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame title={t.login}>
      <GoogleLoginMessage status={googleStatus} />
      {notice === "verification" && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-800">{t.verificationNotice}</p>}
      {notice === "verification-failed" && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-800">{t.verificationSendFailed}</p>}
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
        <div className="text-right">
          <Link href="/forgot-password" className="text-sm font-bold text-blue-700 hover:text-blue-900">
            {t.forgotPassword}
          </Link>
        </div>
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

export function ForgotPasswordView() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (!email.includes("@")) return setError(t.invalidEmail);

    setLoading(true);
    try {
      const data = await postJson("/api/auth/forgot-password", { email });
      setMessage(data.message ?? "パスワード再設定URLを送信しました。");
    } catch (err) {
      setError(userErrorMessage(err, "パスワード再設定メールを送信できませんでした。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame title={t.forgotPasswordTitle}>
      <p className="mt-3 text-sm leading-6 text-slate-600">{t.forgotPasswordLead}</p>
      <form onSubmit={submit} noValidate className="mt-5 space-y-4">
        {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p>}
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        <label className="grid gap-2 text-sm font-semibold">
          {t.email}
          <input value={email} onChange={(e) => setEmail(e.target.value)} className="input" type="email" />
        </label>
        <button disabled={loading} className="btn-primary w-full">
          {loading ? t.sending : "再設定URLを送信"}
        </button>
      </form>
      <Link href="/login" className="btn-secondary mt-5 w-full">
        {t.login}
      </Link>
    </AuthFrame>
  );
}

export function ResetPasswordView({ token }: { token?: string }) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(token ? "" : t.missingResetToken);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (!token) return setError(t.missingResetToken);
    if (newPassword.length < MIN_PASSWORD_LENGTH) return setError(t.passwordLength);
    if (newPassword !== newPasswordConfirm) return setError(t.passwordMismatch);

    setLoading(true);
    try {
      const data = await postJson("/api/auth/reset-password", { token, newPassword, newPasswordConfirm });
      setMessage(data.message ?? t.resetPasswordSuccess);
      setTimeout(() => router.push("/login"), 1200);
    } catch (err) {
      setError(userErrorMessage(err, "パスワード再設定に失敗しました。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame title={t.resetPasswordTitle}>
      <p className="mt-3 text-sm leading-6 text-slate-600">{t.resetPasswordLead}</p>
      <form onSubmit={submit} noValidate className="mt-5 space-y-4">
        {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p>}
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        <label className="grid gap-2 text-sm font-semibold">
          新しいパスワード
          <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" type="password" minLength={MIN_PASSWORD_LENGTH} disabled={!token} />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          新しいパスワード（確認）
          <input value={newPasswordConfirm} onChange={(e) => setNewPasswordConfirm(e.target.value)} className="input" type="password" minLength={MIN_PASSWORD_LENGTH} disabled={!token} />
        </label>
        <button disabled={loading || !token} className="btn-primary w-full">
          {loading ? t.resetPasswordLoading : t.resetPassword}
        </button>
      </form>
      <Link href="/forgot-password" className="btn-secondary mt-5 w-full">
        再設定URLをもう一度送る
      </Link>
    </AuthFrame>
  );
}

export function RegisterView() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!name || !email || !password) return setError(t.registerRequired);
    if (!email.includes("@")) return setError(t.invalidEmail);
    if (password.length < MIN_PASSWORD_LENGTH) return setError(t.passwordLength);
    if (password !== confirmPassword) return setError(t.passwordMismatch);
    if (!termsAccepted || !privacyAccepted) return setError(t.termsRequired);

    setLoading(true);
    try {
      const data = await postJson("/api/auth/register", { name, email, password, termsAccepted, privacyAccepted });
      if (data.message) setMessage(data.message);
      if (data.alreadyRegistered) {
        router.push(data.mailSent === false ? "/login?notice=verification-failed" : "/login?notice=verification");
      } else {
        router.push(data.mailSent === false ? "/verify-email?mail=failed" : "/verify-email");
      }
      router.refresh();
    } catch (err) {
      setError(userErrorMessage(err, t.registerFailed));
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
        <label className="grid gap-2 text-sm font-semibold">
          {t.confirmPassword}
          <input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input" type="password" />
        </label>
        <label className="flex items-start gap-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="mt-1 size-4" />
          <span><Link href="/terms" className="text-blue-700 underline">利用規約</Link>に同意します</span>
        </label>
        <label className="flex items-start gap-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={privacyAccepted} onChange={(e) => setPrivacyAccepted(e.target.checked)} className="mt-1 size-4" />
          <span><Link href="/privacy" className="text-blue-700 underline">プライバシーポリシー</Link>に同意します</span>
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
      setMessage(userErrorMessage(err, t.resendFailed));
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
              <li>CSV、高度分析、解約支援は利用不可</li>
            </ul>
          </Card>
          <Card className="border-blue-400">
            <h2 className="text-2xl font-bold">Premium</h2>
            <p className="mt-2 text-4xl font-black">月額480円</p>
            <p className="mt-2 text-sm font-semibold text-blue-700">毎月の固定費としてPremium機能を利用できます。</p>
            <ul className="mt-5 space-y-2 text-sm text-slate-600">
              <li>サブスク登録・表示無制限</li>
              <li>CSV入出力、CSV明細候補検出</li>
              <li>高度分析、支払い累計、見直しレポート</li>
              <li>乗り換え診断、解約チェックリスト、証跡管理</li>
            </ul>
          </Card>
        </div>
      </div>
    </main>
  );
}
