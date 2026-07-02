"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SubscriptionFormValue = {
  id: string;
  name: string;
  price: number;
  billingCycle: string;
  customCycleDays: number | null;
  nextBillingDate: Date | string;
  categoryId: string | null;
  paymentMethodId: string | null;
  status: string;
  notifyDaysBefore: number | null;
  usageFrequency: string;
  priority: string;
  trialEndsAt: Date | string | null;
  cancellationDeadline: Date | string | null;
  lastReviewedAt: Date | string | null;
  serviceUrl: string | null;
  cancellationUrl: string | null;
  logoUrl: string | null;
  memo: string | null;
};
type Option = { id: string; name: string };
type ServicePreset = {
  name: string;
  price: number;
  billingCycle: "MONTHLY" | "YEARLY" | "WEEKLY" | "CUSTOM";
  serviceUrl: string;
  cancellationUrl: string;
};

const servicePresets: ServicePreset[] = [
  { name: "Adobe Creative Cloud", price: 6480, billingCycle: "MONTHLY", serviceUrl: "https://www.adobe.com/jp/creativecloud.html", cancellationUrl: "https://account.adobe.com/plans" },
  { name: "Amazon Music Unlimited", price: 1080, billingCycle: "MONTHLY", serviceUrl: "https://www.amazon.co.jp/music/unlimited", cancellationUrl: "https://www.amazon.co.jp/music/settings" },
  { name: "Amazon Prime", price: 5900, billingCycle: "YEARLY", serviceUrl: "https://www.amazon.co.jp/prime", cancellationUrl: "https://www.amazon.co.jp/mc" },
  { name: "Apple Music", price: 1080, billingCycle: "MONTHLY", serviceUrl: "https://www.apple.com/jp/apple-music/", cancellationUrl: "https://support.apple.com/ja-jp/HT202039" },
  { name: "Apple One", price: 1200, billingCycle: "MONTHLY", serviceUrl: "https://www.apple.com/jp/apple-one/", cancellationUrl: "https://support.apple.com/ja-jp/HT202039" },
  { name: "Apple TV+", price: 900, billingCycle: "MONTHLY", serviceUrl: "https://www.apple.com/jp/apple-tv-plus/", cancellationUrl: "https://support.apple.com/ja-jp/HT202039" },
  { name: "Asana Starter", price: 1500, billingCycle: "MONTHLY", serviceUrl: "https://asana.com/ja/pricing", cancellationUrl: "https://help.asana.com/" },
  { name: "Audible", price: 1500, billingCycle: "MONTHLY", serviceUrl: "https://www.audible.co.jp/", cancellationUrl: "https://www.audible.co.jp/account/cancel" },
  { name: "Backlog", price: 2970, billingCycle: "MONTHLY", serviceUrl: "https://backlog.com/ja/pricing/", cancellationUrl: "https://support-ja.backlog.com/" },
  { name: "Box Business", price: 1800, billingCycle: "MONTHLY", serviceUrl: "https://www.box.com/ja-jp/pricing", cancellationUrl: "https://support.box.com/" },
  { name: "Canva Pro", price: 1180, billingCycle: "MONTHLY", serviceUrl: "https://www.canva.com/ja_jp/pro/", cancellationUrl: "https://www.canva.com/help/cancel-canva-plan/" },
  { name: "ChatGPT Plus", price: 3000, billingCycle: "MONTHLY", serviceUrl: "https://chatgpt.com/", cancellationUrl: "https://help.openai.com/" },
  { name: "Claude Pro", price: 3000, billingCycle: "MONTHLY", serviceUrl: "https://claude.ai/upgrade", cancellationUrl: "https://support.anthropic.com/" },
  { name: "Cookpad Premium", price: 400, billingCycle: "MONTHLY", serviceUrl: "https://premium-service.cookpad.com/", cancellationUrl: "https://help.cookpad.com/" },
  { name: "Coursera Plus", price: 5900, billingCycle: "MONTHLY", serviceUrl: "https://www.coursera.org/courseraplus", cancellationUrl: "https://www.coursera.support/" },
  { name: "Cursor Pro", price: 3000, billingCycle: "MONTHLY", serviceUrl: "https://cursor.com/pricing", cancellationUrl: "https://docs.cursor.com/account" },
  { name: "DAZN", price: 4200, billingCycle: "MONTHLY", serviceUrl: "https://www.dazn.com/ja-JP/home", cancellationUrl: "https://www.dazn.com/myaccount" },
  { name: "DeepL Pro", price: 1150, billingCycle: "MONTHLY", serviceUrl: "https://www.deepl.com/ja/pro", cancellationUrl: "https://support.deepl.com/" },
  { name: "Disney+", price: 990, billingCycle: "MONTHLY", serviceUrl: "https://www.disneyplus.com/ja-jp", cancellationUrl: "https://www.disneyplus.com/account" },
  { name: "Dropbox Plus", price: 1500, billingCycle: "MONTHLY", serviceUrl: "https://www.dropbox.com/plans", cancellationUrl: "https://help.dropbox.com/account-access/cancel-subscription" },
  { name: "Evernote Personal", price: 1100, billingCycle: "MONTHLY", serviceUrl: "https://evernote.com/intl/jp/compare-plans", cancellationUrl: "https://help.evernote.com/" },
  { name: "Figma Professional", price: 1800, billingCycle: "MONTHLY", serviceUrl: "https://www.figma.com/pricing/", cancellationUrl: "https://help.figma.com/" },
  { name: "GitHub Copilot", price: 1500, billingCycle: "MONTHLY", serviceUrl: "https://github.com/features/copilot/plans", cancellationUrl: "https://docs.github.com/billing" },
  { name: "Google One", price: 250, billingCycle: "MONTHLY", serviceUrl: "https://one.google.com/", cancellationUrl: "https://one.google.com/settings" },
  { name: "Google Workspace Business Starter", price: 800, billingCycle: "MONTHLY", serviceUrl: "https://workspace.google.com/intl/ja/pricing.html", cancellationUrl: "https://support.google.com/a/answer/1257646" },
  { name: "Grammarly Pro", price: 1800, billingCycle: "MONTHLY", serviceUrl: "https://www.grammarly.com/plans", cancellationUrl: "https://support.grammarly.com/" },
  { name: "Hulu", price: 1026, billingCycle: "MONTHLY", serviceUrl: "https://www.hulu.jp/", cancellationUrl: "https://help.hulu.jp/" },
  { name: "iCloud+", price: 150, billingCycle: "MONTHLY", serviceUrl: "https://www.apple.com/jp/icloud/", cancellationUrl: "https://support.apple.com/ja-jp/HT207594" },
  { name: "Kindle Unlimited", price: 980, billingCycle: "MONTHLY", serviceUrl: "https://www.amazon.co.jp/kindle-dbs/hz/subscribe/ku", cancellationUrl: "https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc" },
  { name: "LINE MUSIC", price: 1080, billingCycle: "MONTHLY", serviceUrl: "https://music.line.me/", cancellationUrl: "https://help2.line.me/LINEMusic/" },
  { name: "Microsoft 365 Personal", price: 1490, billingCycle: "MONTHLY", serviceUrl: "https://www.microsoft.com/ja-jp/microsoft-365", cancellationUrl: "https://account.microsoft.com/services" },
  { name: "Money Forward ME Premium", price: 500, billingCycle: "MONTHLY", serviceUrl: "https://moneyforward.com/", cancellationUrl: "https://support.me.moneyforward.com/" },
  { name: "Netflix", price: 1490, billingCycle: "MONTHLY", serviceUrl: "https://www.netflix.com/", cancellationUrl: "https://www.netflix.com/cancelplan" },
  { name: "NewsPicks Premium", price: 1850, billingCycle: "MONTHLY", serviceUrl: "https://newspicks.com/", cancellationUrl: "https://newspicks.zendesk.com/" },
  { name: "Nintendo Switch Online", price: 2400, billingCycle: "YEARLY", serviceUrl: "https://www.nintendo.com/jp/hardware/switch/onlineservice/", cancellationUrl: "https://support.nintendo.com/" },
  { name: "Notion Plus", price: 1650, billingCycle: "MONTHLY", serviceUrl: "https://www.notion.so/pricing", cancellationUrl: "https://www.notion.so/help" },
  { name: "Perplexity Pro", price: 3000, billingCycle: "MONTHLY", serviceUrl: "https://www.perplexity.ai/pro", cancellationUrl: "https://www.perplexity.ai/settings/subscription" },
  { name: "PlayStation Plus Essential", price: 850, billingCycle: "MONTHLY", serviceUrl: "https://www.playstation.com/ja-jp/ps-plus/", cancellationUrl: "https://www.playstation.com/ja-jp/support/store/cancel-ps-store-subscription/" },
  { name: "Proton Unlimited", price: 1800, billingCycle: "MONTHLY", serviceUrl: "https://proton.me/pricing", cancellationUrl: "https://proton.me/support" },
  { name: "Sakura VPS", price: 880, billingCycle: "MONTHLY", serviceUrl: "https://vps.sakura.ad.jp/", cancellationUrl: "https://help.sakura.ad.jp/" },
  { name: "Salesforce Starter", price: 3000, billingCycle: "MONTHLY", serviceUrl: "https://www.salesforce.com/jp/editions-pricing/sales-cloud/", cancellationUrl: "https://help.salesforce.com/" },
  { name: "Slack Pro", price: 1050, billingCycle: "MONTHLY", serviceUrl: "https://slack.com/intl/ja-jp/pricing", cancellationUrl: "https://slack.com/help/articles/218915077" },
  { name: "Spotify Premium", price: 980, billingCycle: "MONTHLY", serviceUrl: "https://www.spotify.com/jp/premium/", cancellationUrl: "https://www.spotify.com/account/subscription/" },
  { name: "Storytel", price: 980, billingCycle: "MONTHLY", serviceUrl: "https://www.storytel.com/jp", cancellationUrl: "https://support.storytel.com/" },
  { name: "TickTick Premium", price: 450, billingCycle: "MONTHLY", serviceUrl: "https://ticktick.com/about/upgrade", cancellationUrl: "https://support.ticktick.com/" },
  { name: "Trello Premium", price: 1500, billingCycle: "MONTHLY", serviceUrl: "https://trello.com/pricing", cancellationUrl: "https://support.atlassian.com/trello/" },
  { name: "U-NEXT", price: 2189, billingCycle: "MONTHLY", serviceUrl: "https://video.unext.jp/", cancellationUrl: "https://help.unext.jp/" },
  { name: "Udemy Personal Plan", price: 2400, billingCycle: "MONTHLY", serviceUrl: "https://www.udemy.com/personal-plan/", cancellationUrl: "https://support.udemy.com/" },
  { name: "Visual Studio Code Pro", price: 1500, billingCycle: "MONTHLY", serviceUrl: "https://code.visualstudio.com/", cancellationUrl: "https://support.microsoft.com/" },
  { name: "Wolt+", price: 498, billingCycle: "MONTHLY", serviceUrl: "https://wolt.com/ja/wolt-plus", cancellationUrl: "https://explore.wolt.com/ja/jpn/help" },
  { name: "Xbox Game Pass Ultimate", price: 1450, billingCycle: "MONTHLY", serviceUrl: "https://www.xbox.com/ja-JP/xbox-game-pass", cancellationUrl: "https://account.microsoft.com/services" },
  { name: "Yahoo!プレミアム", price: 508, billingCycle: "MONTHLY", serviceUrl: "https://premium.yahoo.co.jp/", cancellationUrl: "https://premium.yahoo.co.jp/cancel" },
  { name: "YouTube Premium", price: 1280, billingCycle: "MONTHLY", serviceUrl: "https://www.youtube.com/premium", cancellationUrl: "https://www.youtube.com/paid_memberships" },
  { name: "Zoom Pro", price: 2000, billingCycle: "MONTHLY", serviceUrl: "https://zoom.us/pricing", cancellationUrl: "https://support.zoom.com/" },
];

async function request(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as { message?: string; id?: string };
  if (!response.ok) throw new Error(data.message ?? "処理に失敗しました。");
  return data;
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await request("/api/auth/logout", "POST");
        router.push("/login");
        router.refresh();
      }}
      className="btn-secondary min-h-0 px-3 py-2 text-sm"
    >
      ログアウト
    </button>
  );
}

export function SubscriptionForm({
  subscription,
  categories,
  paymentMethods,
}: {
  subscription?: SubscriptionFormValue | null;
  categories: Option[];
  paymentMethods: Option[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function applyPreset(event: React.ChangeEvent<HTMLSelectElement>) {
    const preset = servicePresets.find((item) => item.name === event.target.value);
    const form = event.currentTarget.form;
    if (!preset || !form) return;
    setInputValue(form, "name", preset.name);
    setInputValue(form, "price", String(preset.price));
    setInputValue(form, "billingCycle", preset.billingCycle);
    setInputValue(form, "serviceUrl", preset.serviceUrl);
    setInputValue(form, "cancellationUrl", preset.cancellationUrl);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const data = await request(subscription ? `/api/subscriptions/${subscription.id}` : "/api/subscriptions", subscription ? "PUT" : "POST", payload);
      router.push(`/subscriptions/${data.id ?? subscription?.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 md:grid-cols-2">
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700 md:col-span-2">{error}</p>}
      <Field label="サービスプリセット">
        <select onChange={applyPreset} className="input" defaultValue="">
          <option value="">手入力する</option>
          {servicePresets.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
        </select>
      </Field>
      <Field label="サービス名"><input name="name" defaultValue={subscription?.name ?? ""} className="input" maxLength={100} required /></Field>
      <Field label="料金"><input name="price" type="number" defaultValue={subscription?.price ?? 0} className="input" min={0} required /></Field>
      <Field label="請求周期">
        <select name="billingCycle" defaultValue={subscription?.billingCycle ?? "MONTHLY"} className="input" required>
          <option value="MONTHLY">月額</option>
          <option value="YEARLY">年額</option>
          <option value="WEEKLY">週額</option>
          <option value="CUSTOM">カスタム</option>
        </select>
      </Field>
      <Field label="次回更新日">
        <input name="nextBillingDate" type="date" defaultValue={dateValue(subscription?.nextBillingDate)} className="input" required />
      </Field>
      <Field label="カテゴリ">
        <select name="categoryId" defaultValue={subscription?.categoryId ?? ""} className="input">
          <option value="">未設定</option>
          {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </Field>
      <Field label="支払い方法">
        <select name="paymentMethodId" defaultValue={subscription?.paymentMethodId ?? ""} className="input">
          <option value="">未設定</option>
          {paymentMethods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </Field>
      <Field label="ステータス">
        <select name="status" defaultValue={subscription?.status ?? "ACTIVE"} className="input" required>
          <option value="ACTIVE">有効</option>
          <option value="PAUSED">一時停止</option>
          <option value="CANCELLED">解約済み</option>
        </select>
      </Field>
      <Field label="通知日数"><input name="notifyDaysBefore" type="number" defaultValue={subscription?.notifyDaysBefore ?? 7} className="input" min={0} /></Field>
      <Field label="利用頻度">
        <select name="usageFrequency" defaultValue={subscription?.usageFrequency ?? "UNKNOWN"} className="input">
          <option value="UNKNOWN">未設定</option>
          <option value="DAILY">毎日使う</option>
          <option value="WEEKLY">週に数回使う</option>
          <option value="MONTHLY">月に数回使う</option>
          <option value="RARELY">ほとんど使っていない</option>
        </select>
      </Field>
      <Field label="重要度">
        <select name="priority" defaultValue={subscription?.priority ?? "UNKNOWN"} className="input">
          <option value="UNKNOWN">未設定</option>
          <option value="ESSENTIAL">必須</option>
          <option value="USEFUL">あると便利</option>
          <option value="OPTIONAL">なくても困らない</option>
        </select>
      </Field>
      <Field label="無料トライアル終了日">
        <input name="trialEndsAt" type="date" defaultValue={dateValue(subscription?.trialEndsAt)} className="input" />
      </Field>
      <Field label="解約期限">
        <input name="cancellationDeadline" type="date" defaultValue={dateValue(subscription?.cancellationDeadline)} className="input" />
      </Field>
      <Field label="最終見直し日">
        <input name="lastReviewedAt" type="date" defaultValue={dateValue(subscription?.lastReviewedAt)} className="input" />
      </Field>
      <Field label="サービスURL"><input name="serviceUrl" defaultValue={subscription?.serviceUrl ?? ""} className="input" type="url" /></Field>
      <Field label="解約URL"><input name="cancellationUrl" defaultValue={subscription?.cancellationUrl ?? ""} className="input" type="url" /></Field>
      <Field label="ロゴURL"><input name="logoUrl" defaultValue={subscription?.logoUrl ?? ""} className="input" type="url" placeholder="未入力ならサービスURLのfaviconを表示" /></Field>
      <label className="grid gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
        メモ
        <textarea name="memo" defaultValue={subscription?.memo ?? ""} className="input min-h-28" maxLength={1000} />
      </label>
      <div className="md:col-span-2">
      <button disabled={loading} className="btn-primary">
        {loading ? "保存中..." : "保存する"}
      </button>
      </div>
    </form>
  );
}

function setInputValue(form: HTMLFormElement, name: string, value: string) {
  const field = form.elements.namedItem(name);
  if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
    field.value = value;
  }
}

function dateValue(value?: Date | string | null) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-semibold text-slate-700">{label}{children}</label>;
}

export function SubscriptionActions({ id }: { id: string }) {
  const router = useRouter();
  return (
    <div className="grid gap-3">
      <button
        onClick={async () => {
          await request(`/api/subscriptions/${id}`, "PATCH", { reviewed: true });
          router.refresh();
        }}
        className="btn-primary w-full"
      >
        見直し済みにする
      </button>
      <button
        onClick={async () => {
          await request(`/api/subscriptions/${id}`, "PATCH", { status: "CANCELLED" });
          router.refresh();
        }}
        className="btn-secondary w-full"
      >
        解約済みにする
      </button>
      <button
        onClick={async () => {
          await request(`/api/subscriptions/${id}`, "DELETE");
          router.push("/subscriptions");
          router.refresh();
        }}
        className="btn-danger w-full"
      >
        削除する
      </button>
    </div>
  );
}

export function CategoryForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        const form = new FormData(event.currentTarget);
        try {
          await request("/api/categories", "POST", Object.fromEntries(form.entries()));
          event.currentTarget.reset();
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "追加に失敗しました。");
        }
      }}
      noValidate
      className="space-y-4"
    >
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <Field label="カテゴリ名"><input name="name" className="input" maxLength={50} required /></Field>
      <Field label="色"><input name="color" type="color" defaultValue="#2563eb" className="h-12 w-20 rounded border border-slate-200" required /></Field>
      <button className="btn-primary">追加</button>
    </form>
  );
}

export function PaymentMethodForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        const form = new FormData(event.currentTarget);
        try {
          await request("/api/payment-methods", "POST", Object.fromEntries(form.entries()));
          event.currentTarget.reset();
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "追加に失敗しました。");
        }
      }}
      noValidate
      className="space-y-4"
    >
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <Field label="名前"><input name="name" className="input" maxLength={50} required /></Field>
      <Field label="種別">
        <select name="type" className="input" required>
          <option value="APPLE_PAY">Apple Pay</option>
          <option value="AMAZON_PAY">Amazon Pay</option>
          <option value="AU_PAY">au PAY</option>
          <option value="BANK">銀行引落</option>
          <option value="BANK_TRANSFER">銀行振込</option>
          <option value="CARRIER_BILLING">キャリア決済</option>
          <option value="CASH">現金</option>
          <option value="CONVENIENCE_STORE">コンビニ払い</option>
          <option value="CREDIT_CARD">クレジットカード</option>
          <option value="D_BARAI">d払い</option>
          <option value="DEBIT_CARD">デビットカード</option>
          <option value="GOOGLE_PAY">Google Pay</option>
          <option value="ID">iD</option>
          <option value="INVOICE">請求書払い</option>
          <option value="LINE_PAY">LINE Pay</option>
          <option value="MERPAY">メルペイ</option>
          <option value="NANACO">nanaco</option>
          <option value="PASMO">PASMO</option>
          <option value="PAYPAL">PayPal</option>
          <option value="PAYPAY">PayPay</option>
          <option value="PREPAID_CARD">プリペイドカード</option>
          <option value="QUICPAY">QUICPay</option>
          <option value="RAKUTEN_EDY">楽天Edy</option>
          <option value="RAKUTEN_PAY">楽天ペイ</option>
          <option value="SUICA">Suica</option>
          <option value="WAON">WAON</option>
          <option value="OTHER">その他</option>
        </select>
      </Field>
      <Field label="メモ"><textarea name="memo" className="input" /></Field>
      <button className="btn-primary">追加</button>
    </form>
  );
}

export function CsvDownloadButton({ disabled }: { disabled: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={() => {
        window.location.href = "/api/export";
      }}
      className="btn-primary mt-5"
    >
      CSVをダウンロード
    </button>
  );
}

export function ProfileSettingsForm({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      await request("/api/settings/profile", "PUT", Object.fromEntries(form.entries()));
      setMessage("プロフィールを更新しました。");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="名前"><input name="name" defaultValue={name} className="input" maxLength={100} required /></Field>
      <Field label="メールアドレス"><input value={email} className="input bg-slate-100 text-slate-500" disabled /></Field>
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <button disabled={loading} className="btn-primary">
        {loading ? "保存中..." : "プロフィールを保存"}
      </button>
    </form>
  );
}

export function PlanSettingsForm({ plan, stripeTestMode }: { plan: "FREE" | "PREMIUM" | "LIFETIME"; stripeTestMode?: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"checkout" | "portal" | "downgrade" | "sync" | "">("");

  async function openStripe(path: "/api/stripe/checkout" | "/api/stripe/portal", mode: "checkout" | "portal", checkoutPlan?: "PREMIUM" | "LIFETIME") {
    setMessage("");
    setError("");
    setLoading(mode);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: checkoutPlan ? { "Content-Type": "application/json" } : undefined,
        body: checkoutPlan ? JSON.stringify({ plan: checkoutPlan }) : undefined,
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string; url?: string };
      if (!response.ok || !data.url) throw new Error(data.message ?? "Stripeページを開けませんでした。");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stripeページを開けませんでした。");
      setLoading("");
    }
  }

  async function syncBilling() {
    setMessage("");
    setError("");
    setLoading("sync");
    try {
      const response = await fetch("/api/stripe/sync", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(data.message ?? "課金状態の確認に失敗しました。");
      setMessage(data.message ?? "課金状態を確認しました。");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "課金状態の確認に失敗しました。");
    } finally {
      setLoading("");
    }
  }

  async function downgrade() {
    setMessage("");
    setError("");
    setLoading("downgrade");
    try {
      await request("/api/settings/plan", "PUT", { plan: "FREE" });
      setMessage("アプリ表示をFreeに変更しました。Stripeで課金中の場合は、Stripeポータルから解約も行ってください。");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "プラン変更に失敗しました。");
    } finally {
      setLoading("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-100 bg-white/70 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold">Free</p>
            {plan === "FREE" && <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">現在のプラン</span>}
          </div>
          <p className="mt-2 text-sm text-slate-600">サブスク10件、カテゴリ5件まで管理できます。基本ダッシュボード、カレンダー、通知チェックを利用できます。</p>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50/80 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold text-blue-900">Premium</p>
            {plan === "PREMIUM" && <span className="rounded-full bg-blue-600 px-2 py-1 text-xs font-black text-white">現在のプラン</span>}
          </div>
          <p className="mt-2 text-sm text-blue-800">サブスク無制限、CSV入出力、明細検出、高度な分析、月次レポート、AI提案、解約支援を利用できます。</p>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/80 p-4 shadow-sm sm:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold text-emerald-900">買い切り</p>
            {plan === "LIFETIME" && <span className="rounded-full bg-emerald-600 px-2 py-1 text-xs font-black text-white">現在のプラン</span>}
          </div>
          <p className="mt-2 text-sm text-emerald-800">Premiumと同じ機能を、継続課金なしで利用できます。個人利用や小規模運用向けの安心プランです。</p>
        </div>
      </div>
      {stripeTestMode && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <p className="font-black">Stripeテストモードが有効です</p>
          <p>Stripe Checkoutではカード番号 <span className="font-mono font-bold">4242 4242 4242 4242</span> を使用してください。</p>
          <p>有効期限は未来日、CVCは任意の3桁、氏名・住所・郵便番号は任意のテスト値で入力できます。</p>
          <p>Stripeのテストキーを使用している間、実際の請求は発生しません。</p>
        </div>
      )}
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {plan === "FREE" ? (
          <button type="button" disabled={Boolean(loading)} onClick={() => openStripe("/api/stripe/checkout", "checkout", "PREMIUM")} className="btn-primary">
            {loading === "checkout" ? "Stripeを開いています..." : "Premiumにアップグレード"}
          </button>
        ) : plan === "PREMIUM" ? (
          <button type="button" disabled={Boolean(loading)} onClick={() => openStripe("/api/stripe/portal", "portal")} className="btn-primary">
            {loading === "portal" ? "Stripeを開いています..." : "課金を管理"}
          </button>
        ) : (
          <button type="button" disabled className="btn-primary opacity-80">
            買い切り適用済み
          </button>
        )}
        {plan !== "LIFETIME" && (
          <button type="button" disabled={Boolean(loading)} onClick={() => openStripe("/api/stripe/checkout", "checkout", "LIFETIME")} className="btn-secondary">
            {loading === "checkout" ? "Stripeを開いています..." : "買い切りで利用する"}
          </button>
        )}
        <button type="button" disabled={Boolean(loading)} onClick={syncBilling} className="btn-secondary">
          {loading === "sync" ? "確認中..." : "課金状態を再確認"}
        </button>
        {plan === "PREMIUM" && (
          <button type="button" disabled={Boolean(loading)} onClick={downgrade} className="btn-secondary">
            {loading === "downgrade" ? "更新中..." : "アプリ表示をFreeに変更"}
          </button>
        )}
      </div>
      <p className="text-xs leading-5 text-slate-500">決済完了後にPremium表示へ切り替わらない場合は「課金状態を再確認」を押してください。通常はCheckout完了後またはWebhook受信時に自動で反映されます。</p>
    </div>
  );
}

export function PasswordSettingsForm() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      await request("/api/settings/password", "PUT", Object.fromEntries(form.entries()));
      event.currentTarget.reset();
      setMessage("パスワードを変更しました。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "パスワード変更に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="現在のパスワード"><input name="currentPassword" className="input" type="password" required /></Field>
      <Field label="新しいパスワード"><input name="newPassword" className="input" type="password" minLength={8} required /></Field>
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <button disabled={loading} className="btn-primary">
        {loading ? "変更中..." : "パスワードを変更"}
      </button>
    </form>
  );
}

export function PaymentHistoryForm({
  subscriptionId,
  subscriptions,
  defaultAmount,
}: {
  subscriptionId?: string;
  subscriptions?: Array<{ id: string; name: string; price: number }>;
  defaultAmount?: number;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      await request("/api/payment-histories", "POST", Object.fromEntries(form.entries()));
      event.currentTarget.reset();
      setMessage("支払い履歴を登録しました。");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "支払い履歴の登録に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 md:grid-cols-2">
      {subscriptionId ? (
        <input type="hidden" name="subscriptionId" value={subscriptionId} />
      ) : (
        <Field label="サブスク">
          <select name="subscriptionId" className="input" required>
            <option value="">選択してください</option>
            {(subscriptions ?? []).map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="支払い金額"><input name="amount" type="number" defaultValue={defaultAmount ?? ""} className="input" min={0} required /></Field>
      <Field label="支払い日"><input name="paidAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="input" required /></Field>
      <label className="grid gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
        メモ
        <textarea name="memo" className="input min-h-28" maxLength={500} placeholder="領収書番号、カード明細名、確認メモなど" />
      </label>
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 md:col-span-2">{message}</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700 md:col-span-2">{error}</p>}
      <div className="md:col-span-2">
        <button disabled={loading} className="btn-primary">
          {loading ? "登録中..." : "支払いを記録"}
        </button>
      </div>
    </form>
  );
}

export function DeletePaymentHistoryButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <button
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await request(`/api/payment-histories/${id}`, "DELETE");
          router.refresh();
        } finally {
          setLoading(false);
        }
      }}
      className="btn-secondary min-h-0 px-3 py-2 text-xs"
    >
      {loading ? "削除中" : "削除"}
    </button>
  );
}

export function CancellationPlanForm({
  id,
  status,
  plannedCancelAt,
  memo,
}: {
  id: string;
  status: "NONE" | "CONSIDERING" | "PLANNED" | "REQUESTED" | "COMPLETED";
  plannedCancelAt?: Date | string | null;
  memo?: string | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      await request(`/api/subscriptions/${id}`, "PATCH", Object.fromEntries(form.entries()));
      setMessage("解約支援の状態を更新しました。");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="解約ステータス">
        <select name="cancellationStatus" defaultValue={status} className="input">
          <option value="NONE">未着手</option>
          <option value="CONSIDERING">検討中</option>
          <option value="PLANNED">解約予定</option>
          <option value="REQUESTED">解約申請済み</option>
          <option value="COMPLETED">解約完了</option>
        </select>
      </Field>
      <Field label="解約予定日"><input name="plannedCancelAt" type="date" defaultValue={dateValue(plannedCancelAt)} className="input" /></Field>
      <Field label="解約メモ"><textarea name="cancellationMemo" defaultValue={memo ?? ""} className="input min-h-24" maxLength={1000} placeholder="問い合わせ番号、解約手順、次に確認することなど" /></Field>
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <button disabled={loading} className="btn-primary w-full">{loading ? "更新中..." : "解約支援を更新"}</button>
    </form>
  );
}

export function BudgetSettingsForm({
  monthlyBudget,
  defaultNotifyDaysBefore,
  notificationHour,
}: {
  monthlyBudget?: number | null;
  defaultNotifyDaysBefore: number;
  notificationHour: number;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      await request("/api/settings/budget", "PUT", Object.fromEntries(form.entries()));
      setMessage("予算と通知設定を更新しました。");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="月額サブスク予算"><input name="monthlyBudget" type="number" defaultValue={monthlyBudget ?? ""} className="input" min={0} placeholder="例: 15000" /></Field>
      <Field label="標準通知日数"><input name="defaultNotifyDaysBefore" type="number" defaultValue={defaultNotifyDaysBefore} className="input" min={0} max={60} required /></Field>
      <Field label="通知時刻"><input name="notificationHour" type="number" defaultValue={notificationHour} className="input" min={0} max={23} required /></Field>
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <button disabled={loading} className="btn-primary">{loading ? "保存中..." : "予算・通知を保存"}</button>
    </form>
  );
}

export function CsvImportForm({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/import/subscriptions", { method: "POST", body: form });
      const data = (await response.json().catch(() => ({}))) as { message?: string; created?: number; skipped?: number };
      if (!response.ok) throw new Error(data.message ?? "インポートに失敗しました。");
      setMessage(`${data.created ?? 0}件を取り込みました。スキップ: ${data.skipped ?? 0}件`);
      event.currentTarget.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "インポートに失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="CSVファイル"><input name="file" type="file" accept=".csv,text/csv" className="input" disabled={disabled} required /></Field>
      <p className="text-sm leading-6 text-slate-600">対応列: サービス名、料金、請求周期、次回更新日、カテゴリ、支払い方法、サービスURL、解約URL、メモ。</p>
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <button disabled={disabled || loading} className="btn-primary">{loading ? "取り込み中..." : "CSVをインポート"}</button>
      {disabled && <p className="text-sm font-semibold text-amber-700">CSVインポートはPremium限定です。</p>}
    </form>
  );
}

export function CancellationChecklist({
  items,
}: {
  items: Array<{ id: string; label: string; completedAt: Date | string | null }>;
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState("");

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const completed = Boolean(item.completedAt);
        return (
          <button
            key={item.id}
            type="button"
            disabled={loadingId === item.id}
            onClick={async () => {
              setLoadingId(item.id);
              try {
                await request(`/api/cancellation-checklist/${item.id}`, "PATCH", { completed: !completed });
                router.refresh();
              } finally {
                setLoadingId("");
              }
            }}
            className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm font-semibold transition ${
              completed ? "border-emerald-100 bg-emerald-50 text-emerald-800" : "border-slate-100 bg-white/80 text-slate-700 hover:border-blue-200 hover:bg-blue-50"
            }`}
          >
            <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-black ${completed ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"}`}>
              {completed ? "✓" : ""}
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function CancellationEvidenceForm({ subscriptionId }: { subscriptionId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      await request("/api/cancellation-evidences", "POST", Object.fromEntries(form.entries()));
      event.currentTarget.reset();
      setMessage("証跡を追加しました。");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "証跡の追加に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <Field label="証跡タイトル"><input name="title" className="input" maxLength={100} required placeholder="例: 解約受付メール" /></Field>
      <Field label="種類">
        <select name="kind" className="input" defaultValue="MEMO">
          <option value="REQUEST">申請記録</option>
          <option value="RECEIPT">受付番号</option>
          <option value="EMAIL">メール</option>
          <option value="SCREENSHOT">スクリーンショットURL</option>
          <option value="MEMO">メモ</option>
        </select>
      </Field>
      <Field label="記録日"><input name="recordedAt" type="date" className="input" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
      <Field label="参照URL"><input name="referenceUrl" type="url" className="input" placeholder="メール、スクリーンショット、受付ページなど" /></Field>
      <label className="grid gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
        メモ
        <textarea name="memo" className="input min-h-24" maxLength={1000} placeholder="受付番号、担当窓口、確認した内容など" />
      </label>
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 md:col-span-2">{message}</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700 md:col-span-2">{error}</p>}
      <div className="md:col-span-2"><button disabled={loading} className="btn-primary">{loading ? "追加中..." : "証跡を追加"}</button></div>
    </form>
  );
}

export function DeleteCancellationEvidenceButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await request(`/api/cancellation-evidences/${id}`, "DELETE");
          router.refresh();
        } finally {
          setLoading(false);
        }
      }}
      className="btn-secondary min-h-0 px-3 py-2 text-xs"
    >
      {loading ? "削除中" : "削除"}
    </button>
  );
}

export function CsvCandidateDetectorForm({ disabled }: { disabled: boolean }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    totalRows: number;
    detected: number;
    candidates: Array<{ name: string; merchant: string; amount: number; occurrences: number; firstDate: string; lastDate: string; confidence: number; reason: string }>;
  } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    setResult(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/import/candidates", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message ?? "候補検出に失敗しました。");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "候補検出に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="カード・銀行明細CSV"><input name="file" type="file" accept=".csv,text/csv" className="input" disabled={disabled} required /></Field>
        <p className="text-sm leading-6 text-slate-600">摘要、利用店名、加盟店名、金額、利用日などの列から、サブスク候補を検出します。ここではDB登録せず候補確認だけ行います。</p>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        <button disabled={disabled || loading} className="btn-primary">{loading ? "検出中..." : "サブスク候補を検出"}</button>
        {disabled && <p className="text-sm font-semibold text-amber-700">CSV明細候補検出はPremium限定です。</p>}
      </form>
      {result && (
        <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-4">
          <p className="font-bold">解析結果: {result.totalRows}行中 {result.detected}件の候補</p>
          <div className="mt-4 space-y-3">
            {result.candidates.length === 0 ? (
              <p className="text-sm font-semibold text-slate-500">候補は見つかりませんでした。</p>
            ) : result.candidates.map((item) => (
              <div key={`${item.merchant}-${item.amount}`} className="rounded-lg border border-white bg-white p-3 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-black">{item.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{item.merchant} / {item.occurrences}回 / {item.firstDate || "日付不明"} - {item.lastDate || "日付不明"}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-black">{new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(item.amount)}</p>
                    <p className="text-xs font-bold text-blue-700">信頼度 {item.confidence}%</p>
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-600">{item.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
