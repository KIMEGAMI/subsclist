"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/app-shell";
import { FREE_CATEGORY_LIMIT, FREE_SUBSCRIPTION_LIMIT, MAX_USER_NAME_LENGTH, MIN_PASSWORD_LENGTH, PREMIUM_MONTHLY_PRICE_YEN, STRIPE_TRIAL_PERIOD_DAYS } from "@/lib/app-constants";
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
  pricingTitle: "\u6599\u91d1\u30d7\u30e9\u30f3",
  pricingLead: `Free\u3067\u59cb\u3081\u3066\u3001\u5fc5\u8981\u306b\u306a\u3063\u305f\u3089Premium\u3078\u3002Premium\u306f\u521d\u56de\u306e\u307f${STRIPE_TRIAL_PERIOD_DAYS}\u65e5\u9593\u304a\u8a66\u3057\u7121\u6599\u3002\u7121\u6599\u671f\u9593\u4e2d\u306b\u89e3\u7d04\u3059\u308c\u3070\u6599\u91d1\u306f\u304b\u304b\u3089\u305a\u3001\u305d\u306e\u5f8c\u306f\u6708\u984d${PREMIUM_MONTHLY_PRICE_YEN}\u5186\u3067\u5206\u6790\u3001CSV\u3001\u89e3\u7d04\u652f\u63f4\u3092\u307e\u3068\u3081\u3066\u5229\u7528\u3067\u304d\u307e\u3059\u3002`,
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
  const comparisonRows = [
    ["契約台帳", `${FREE_SUBSCRIPTION_LIMIT}件まで`, "登録・表示無制限"],
    ["更新カレンダー・基本通知", "利用可能", "利用可能"],
    ["支払い履歴", "今月の記録・修正", "過去年検索・科目一括整理"],
    ["CSV", "利用不可", "契約入出力・明細照合・名義ルール・支払い一括登録・支払実績出力"],
    ["支払い管理", "基本集計", "請求突合・差異検知・月次締め"],
    ["分析・レポート", "利用不可", "前年差・年間仕事利用分・支払い累計・PDF"],
    ["見直し・解約", "基本利用記録", "優先行動・更新判断・削減成果・解約証跡"],
    ["高度な通知", "更新などの基本通知", "未使用・値上げ・予算・月次サマリー"],
  ] as const;
  const workflow = [
    ["1. 集める", "直接登録またはCSV取込で、更新日と支払い条件を一つの台帳へ。"],
    ["2. 判断する", "利用頻度、重要度、期限、前年差から、今月見る契約を優先表示。"],
    ["3. 締める", "請求予定と支払いを突合し、科目・証憑の不足を解消して月次締め。"],
    ["4. 残す", "支払い時点の記録から年間レポートとCSVを作り、実績を維持。"],
  ] as const;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="font-bold text-blue-700">{t.backTop}</Link>
        <div className="mt-8 max-w-3xl">
          <p className="text-sm font-black text-blue-700">料金プラン</p>
          <h1 className="mt-2 text-4xl font-black leading-tight">継続課金を、毎月判断できる状態に。</h1>
          <p className="mt-4 leading-7 text-slate-600">Freeで台帳を始め、Premiumで取り込み、突合、見直し、解約、年間整理までを一つの運用にできます。</p>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <Card>
            <h2 className="text-2xl font-bold">Free</h2>
            <p className="mt-2 text-4xl font-black">無料</p>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">まず契約台帳と更新確認を始めたい方向け。</p>
            <ul className="mt-5 space-y-2 text-sm text-slate-600"><li>サブスク{FREE_SUBSCRIPTION_LIMIT}件まで</li><li>カテゴリ{FREE_CATEGORY_LIMIT}件まで</li><li>ダッシュボード、一覧、カレンダー、基本通知</li><li>今月の支払い記録と修正</li></ul>
            <Link href="/register" className="btn-secondary mt-6 w-full justify-center">無料で始める</Link>
          </Card>
          <Card className="border-blue-400">
            <div className="flex items-center justify-between gap-3"><h2 className="text-2xl font-bold">Premium</h2><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">初回無料体験</span></div>
            <p className="mt-2 text-4xl font-black">月額{PREMIUM_MONTHLY_PRICE_YEN}円</p>
            <p className="mt-2 text-sm font-black text-blue-700">初回のみ{STRIPE_TRIAL_PERIOD_DAYS}日間お試し無料</p>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">複数のSaaSを仕事で使い、毎月の支払い確認と見直しを短時間で終えたい方向け。</p>
            <ul className="mt-5 space-y-2 text-sm text-slate-600"><li>登録・表示無制限</li><li>請求突合、月次締め、科目一括整理</li><li>前年差、年間仕事利用分、支払い累計</li><li>更新判断、削減成果、解約チェックリスト・証跡</li></ul>
            <Link href="/register" className="btn-primary mt-6 w-full justify-center">登録して{STRIPE_TRIAL_PERIOD_DAYS}日間試す</Link>
          </Card>
        </div>

        <section className="mt-12 border-y border-slate-200 bg-white px-4 py-8 sm:px-6">
          <h2 className="text-2xl font-black">プラン比較</h2>
          <p className="mt-2 text-sm font-semibold text-slate-600">Premium限定機能は画面だけでなくAPI側でもプランを確認します。</p>
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-[720px] w-full divide-y divide-slate-200 text-sm">
              <thead><tr><th className="px-3 py-3 text-left">機能</th><th className="px-3 py-3 text-left">Free</th><th className="px-3 py-3 text-left text-blue-700">Premium</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{comparisonRows.map(([feature, free, premium]) => <tr key={feature}><th className="px-3 py-4 text-left font-black text-slate-800">{feature}</th><td className="px-3 py-4 text-slate-600">{free}</td><td className="px-3 py-4 font-bold text-slate-900">{premium}</td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <section className="py-12">
          <p className="text-sm font-black text-cyan-800">毎月の運用</p>
          <h2 className="mt-2 text-3xl font-black">登録で終わらず、整理した結果を残す</h2>
          <div className="mt-7 grid gap-6 md:grid-cols-4">{workflow.map(([title, body]) => <div key={title} className="border-t-4 border-cyan-600 pt-4"><h3 className="font-black">{title}</h3><p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{body}</p></div>)}</div>
        </section>

        <section className="border-t border-slate-200 py-10 text-center">
          <h2 className="text-2xl font-black">まず実データを入れずに確認できます</h2>
          <p className="mt-3 text-sm font-semibold text-slate-600">デモで操作を確認するか、Freeアカウントから始めてください。</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><Link href="/" className="btn-secondary justify-center">トップでデモを開く</Link><Link href="/register" className="btn-primary justify-center">無料アカウントを作る</Link><Link href="/login" className="btn-secondary justify-center">登録済みの方</Link></div>
          <p className="mt-5 text-xs font-semibold leading-5 text-slate-500">Premiumはカード登録後に開始します。無料期間中にStripeの契約管理から解約すればPremium料金は請求されません。</p>
        </section>
      </div>
    </main>
  );
}
