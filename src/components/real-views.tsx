import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell, Card, PageHeader } from "@/components/app-shell";
import { AiRecommendationsPanel } from "@/components/ai-recommendations";
import { NotificationSendButton } from "@/components/notification-send-button";
import { BudgetSettingsForm, CancellationChecklist, CancellationEvidenceForm, CancellationPlanForm, CategoryForm, CsvCandidateDetectorForm, CsvDownloadButton, CsvImportForm, DeleteCancellationEvidenceButton, DeletePaymentHistoryButton, LogoutButton, PasswordSettingsForm, PaymentHistoryForm, PaymentMethodForm, PlanSettingsForm, ProfileSettingsForm, SubscriptionActions, SubscriptionForm } from "@/components/real-forms";
import { requireVerifiedUser } from "@/lib/auth";
import {
  ALLOWED_URL_PROTOCOLS,
  DEFAULT_NOTIFICATION_HOUR,
  DEFAULT_NOTIFY_DAYS_BEFORE,
  PLACEHOLDER_HOSTS,
  REVIEW_CAUTION_SCORE_THRESHOLD,
  REVIEW_STALE_DAYS,
  REVIEW_URGENT_SCORE_THRESHOLD,
  UPCOMING_DEADLINE_DAYS,
} from "@/lib/app-constants";
import { annualAmount, daysUntil, isoDate, MONTHS_PER_YEAR, monthlyAmount as monthly } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { FREE_SUBSCRIPTION_LIMIT, hiddenByPlan, isPremiumPlan, limitByPlan } from "@/lib/plans";
import { estimatedMonthlySaving, reviewScore } from "@/lib/subscription-insights";
import { syncStripeCheckoutSessionById } from "@/lib/stripe-billing";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

type CancellationStatusValue = "NONE" | "CONSIDERING" | "PLANNED" | "REQUESTED" | "COMPLETED";

type CategoryView = { id: string; name: string; color: string };

type PaymentMethodView = { id: string; name: string; type: string; memo: string | null };

type PaymentHistoryView = {
  id: string;
  subscriptionId: string;
  amount: number;
  paidAt: Date;
  memo: string | null;
  subscription: { id: string; name: string; category?: CategoryView | null; paymentMethod?: PaymentMethodView | null };
};

type CancellationChecklistView = { id: string; label: string; completedAt: Date | null };

type CancellationEvidenceView = {
  id: string;
  title: string;
  kind: string;
  referenceUrl: string | null;
  memo: string | null;
  recordedAt: Date;
};

type UserPreferenceView = { monthlyBudget: number | null; defaultNotifyDaysBefore: number; notificationHour: number };

type SubscriptionView = {
  id: string;
  name: string;
  price: number;
  currency: string;
  billingCycle: string;
  customCycleDays: number | null;
  nextBillingDate: Date;
  status: string;
  memo: string | null;
  serviceUrl: string | null;
  cancellationUrl: string | null;
  trialEndsAt: Date | null;
  cancellationDeadline: Date | null;
  lastReviewedAt: Date | null;
  notifyDaysBefore: number | null;
  usageFrequency: string;
  priority: string;
  logoUrl: string | null;
  categoryId: string | null;
  paymentMethodId: string | null;
  cancellationStatus: CancellationStatusValue;
  plannedCancelAt: Date | null;
  cancellationMemo: string | null;
  cancellationCompletedAt?: Date | null;
  category?: CategoryView | null;
  paymentMethod?: PaymentMethodView | null;
  paymentHistories: PaymentHistoryView[];
};

const paymentMethodTypeLabels: Record<string, string> = {
  APPLE_PAY: "Apple Pay",
  AMAZON_PAY: "Amazon Pay",
  AU_PAY: "au PAY",
  BANK: "銀行口座振替",
  BANK_TRANSFER: "銀行振込",
  CARRIER_BILLING: "キャリア決済",
  CASH: "現金",
  CONVENIENCE_STORE: "コンビニ払い",
  CREDIT_CARD: "クレジットカード",
  D_BARAI: "d Barai",
  DEBIT_CARD: "デビットカード",
  GOOGLE_PAY: "Google Pay",
  ID: "iD",
  INVOICE: "請求書払い",
  LINE_PAY: "LINE Pay",
  MERPAY: "メルペイ",
  NANACO: "nanaco",
  PASMO: "PASMO",
  PAYPAL: "PayPal",
  PAYPAY: "PayPay",
  PREPAID_CARD: "プリペイドカード",
  QUICPAY: "QUICPay",
  RAKUTEN_EDY: "楽天Edy",
  RAKUTEN_PAY: "楽天ペイ",
  SUICA: "Suica",
  WAON: "WAON",
  OTHER: "その他",
};

function EmptyState({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-slate-200 bg-white/70 p-4 text-sm font-semibold text-slate-500">{text}</p>;
}

function PlanLimitBanner({ hiddenCount }: { hiddenCount: number }) {
  if (hiddenCount <= 0) return null;
  return (
    <Card className="mb-5 border-amber-200 bg-amber-50/90">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-black text-amber-900">Freeプランではサブスクは{FREE_SUBSCRIPTION_LIMIT}件まで表示・管理できます。</p>
          <p className="mt-1 text-sm font-semibold text-amber-800">現在 {hiddenCount}件 が非表示です。Premiumに変更すると全件表示、AI診断、CSV、高度分析、解約支援が使えます。</p>
        </div>
        <Link href="/settings" className="btn-primary shrink-0">Premiumに変更</Link>
      </div>
    </Card>
  );
}

function PremiumValueCard({ monthlyTotal, saving, reviewCount, urgentCount }: { monthlyTotal: number; saving: number; reviewCount: number; urgentCount: number }) {
  const yearlySaving = saving * MONTHS_PER_YEAR;
  return (
    <Card className="mt-6 border-blue-200 bg-gradient-to-br from-blue-50/95 to-cyan-50/90">
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="text-xs font-black uppercase text-blue-700">Premium Value</p>
          <h2 className="mt-2 text-xl font-black text-blue-950">固定費の見直し余地を毎月チェック</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-blue-900">登録済みサブスクから、見直し候補・期限リスク・削減見込みを自動で整理します。</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-white/80 p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">月額固定費</p><p className="mt-1 text-2xl font-black text-slate-950">{yen.format(monthlyTotal)}</p></div>
          <div className="rounded-lg bg-white/80 p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">年間削減候補</p><p className="mt-1 text-2xl font-black text-emerald-700">{yen.format(yearlySaving)}</p></div>
          <div className="rounded-lg bg-white/80 p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">見直し候補</p><p className="mt-1 text-2xl font-black text-slate-950">{reviewCount}件</p></div>
          <div className="rounded-lg bg-white/80 p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">期限リスク</p><p className="mt-1 text-2xl font-black text-rose-700">{urgentCount}件</p></div>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Link href="/review" className="btn-primary">見直しレポートを見る</Link>
        <Link href="/monthly-report" className="btn-secondary">月次レポートを見る</Link>
      </div>
    </Card>
  );
}

function OperationalCommandCard({
  score,
  dataQuality,
  urgentCount,
  reviewCount,
  lowUsageCount,
  budgetRate,
  budgetExceeded,
}: {
  score: number;
  dataQuality: number;
  urgentCount: number;
  reviewCount: number;
  lowUsageCount: number;
  budgetRate: number;
  budgetExceeded: boolean;
}) {
  const scoreTone = score >= 80 ? "text-emerald-700" : score >= 60 ? "text-amber-700" : "text-rose-700";
  const actions = [
    budgetExceeded ? "月額予算を超過しています。削減候補から優先して見直してください。" : null,
    urgentCount > 0 ? `7日以内に対応が必要な契約が${urgentCount}件あります。` : null,
    reviewCount > 0 ? `見直し未実施または要確認の契約が${reviewCount}件あります。` : null,
    lowUsageCount > 0 ? `利用頻度が低い契約が${lowUsageCount}件あります。` : null,
    dataQuality < 80 ? "カテゴリ、支払い方法、利用頻度、最終見直し日を埋めると分析精度が上がります。" : null,
  ].filter(Boolean) as string[];

  return (
    <Card className="mt-6 border-slate-200 bg-white/92">
      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="text-sm font-black text-slate-500">運用スコア</p>
          <div className="mt-3 flex items-end gap-3">
            <p className={`text-6xl font-black ${scoreTone}`}>{score}</p>
            <p className="pb-2 text-sm font-bold text-slate-500">/ 100</p>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            更新期限、見直し状況、予算、登録データの充実度から算出しています。
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MiniMetric label="優先アクション" value={`${actions.length}件`} />
            <MiniMetric label="データ充実度" value={`${dataQuality}%`} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">今月の優先アクション</h2>
            <Link href="/review" className="text-sm font-semibold text-blue-700">見直しレポート</Link>
          </div>
          <div className="mt-4 space-y-3">
            {actions.length === 0 ? (
              <EmptyState text="今すぐ対応が必要な項目はありません。次回更新予定を確認しながら運用できます。" />
            ) : (
              actions.slice(0, 5).map((action) => (
                <div key={action} className="rounded-lg border border-slate-100 bg-slate-50/80 p-4 text-sm font-semibold leading-6 text-slate-700">
                  {action}
                </div>
              ))
            )}
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${budgetExceeded ? "bg-rose-500" : "bg-blue-600"}`} style={{ width: `${Math.min(100, budgetRate)}%` }} />
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-500">予算消化率 {budgetRate}%</p>
        </div>
      </div>
    </Card>
  );
}

function SetupChecklistCard({
  subscriptionCount,
  hasCategory,
  hasPaymentMethod,
  hasBudget,
  hasReviewData,
}: {
  subscriptionCount: number;
  hasCategory: boolean;
  hasPaymentMethod: boolean;
  hasBudget: boolean;
  hasReviewData: boolean;
}) {
  const steps = [
    { label: "サブスクを登録", done: subscriptionCount > 0, href: "/subscriptions/new", action: "追加" },
    { label: "カテゴリを設定", done: hasCategory, href: "/categories", action: "設定" },
    { label: "支払い方法を設定", done: hasPaymentMethod, href: "/payment-methods", action: "設定" },
    { label: "月額予算を設定", done: hasBudget, href: "/settings", action: "設定" },
    { label: "利用頻度と見直し日を入力", done: hasReviewData, href: "/subscriptions", action: "見直す" },
  ];
  const doneCount = steps.filter((step) => step.done).length;

  return (
    <Card className="mb-5 border-emerald-100 bg-emerald-50/85">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-sm font-black text-emerald-700">初期設定チェック</p>
          <h2 className="mt-1 text-xl font-black text-emerald-950">分析精度を上げるための準備</h2>
          <p className="mt-2 text-sm font-semibold text-emerald-800">{doneCount}/{steps.length} 完了。登録情報が増えるほど、削減候補と通知の精度が上がります。</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[520px]">
          {steps.map((step) => (
            <Link key={step.label} href={step.href} className="flex items-center justify-between gap-3 rounded-lg border border-white/70 bg-white/75 px-3 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:border-emerald-200 hover:bg-white">
              <span className="flex items-center gap-2">
                <span className={`grid size-5 place-items-center rounded-full text-[11px] font-black ${step.done ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"}`}>{step.done ? "済" : "未"}</span>
                {step.label}
              </span>
              {!step.done && <span className="text-xs text-emerald-700">{step.action}</span>}
            </Link>
          ))}
        </div>
      </div>
    </Card>
  );
}

function PremiumOnlyNotice({ title, description }: { title: string; description: string }) {
  return (
    <Card className="border-blue-200 bg-blue-50/90">
      <p className="text-sm font-black text-blue-700">Premium限定</p>
      <h2 className="mt-2 text-2xl font-black text-blue-950">{title}</h2>
      <p className="mt-3 text-sm font-semibold leading-6 text-blue-900">{description}</p>
      <Link href="/settings" className="btn-primary mt-5 inline-flex">Premiumに変更</Link>
    </Card>
  );
}

function dateText(value?: Date | null) {
  return value ? isoDate(value) : "未設定";
}

function serviceIcon(item: { logoUrl?: string | null; serviceUrl?: string | null; name: string }) {
  if (item.logoUrl) return item.logoUrl;
  if (!item.serviceUrl) return null;
  try {
    const url = new URL(item.serviceUrl);
    return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`;
  } catch {
    return null;
  }
}

function safeExternalUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!(ALLOWED_URL_PROTOCOLS as readonly string[]).includes(url.protocol)) return null;
    if ((PLACEHOLDER_HOSTS as readonly string[]).includes(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function yearMonthKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function monthFromKey(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function monthRange(start: Date, end: Date) {
  const months: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= last) {
    months.push(yearMonthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

function needsReview(value?: Date | null) {
  if (!value) return true;
  return daysUntil(value) < -REVIEW_STALE_DAYS;
}

const defaultCancellationChecklist = [
  "解約条件と最低利用期間を確認する",
  "次回更新日と解約期限を確認する",
  "必要なデータや領収書を保存する",
  "解約ページまたは問い合わせ窓口で手続きする",
  "受付番号・完了メール・画面URLを証跡に残す",
  "次回請求が止まっているか確認する",
];

export async function DashboardView() {
  const user = await requireVerifiedUser();
  const [allSubscriptions, preference] = (await Promise.all([
    prisma.subscription.findMany({
      where: { userId: user.id, deletedAt: null },
      include: { category: true, paymentMethod: true },
      orderBy: { nextBillingDate: "asc" },
    }),
    prisma.userPreference.findUnique({ where: { userId: user.id } }),
  ])) as unknown as [SubscriptionView[], UserPreferenceView | null];
  const subscriptions = limitByPlan(allSubscriptions, user.plan);
  const hiddenCount = hiddenByPlan(allSubscriptions.length, user.plan);
  const active = subscriptions.filter((item) => item.status === "ACTIVE");
  const monthlyTotal = active.reduce((sum, item) => sum + monthly(item.price, item.billingCycle, item.customCycleDays), 0);
  const budget = preference?.monthlyBudget ?? null;
  const budgetRate = budget ? percent(monthlyTotal, budget) : 0;
  const urgentItems = active.filter((item) => daysUntil(item.nextBillingDate) <= 7 || (item.trialEndsAt && daysUntil(item.trialEndsAt) <= 7) || (item.cancellationDeadline && daysUntil(item.cancellationDeadline) <= 7));
  const reviewItems = active.filter((item) => needsReview(item.lastReviewedAt));
  const saving = active.reduce((sum, item) => sum + estimatedMonthlySaving(item), 0);
  const categoryCounts = active.reduce<Record<string, number>>((acc, item) => {
    const key = item.categoryId ?? "none";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const scoredItems = active.map((item) => reviewScore(item, categoryCounts[item.categoryId ?? "none"] ?? 1));
  const reviewPriorityCount = scoredItems.filter((item) => item.score >= REVIEW_CAUTION_SCORE_THRESHOLD).length;
  const lowUsageCount = active.filter((item) => item.usageFrequency === "RARELY" || item.priority === "OPTIONAL").length;
  const filledFields = active.reduce((sum, item) => {
    return sum + Number(Boolean(item.categoryId)) + Number(Boolean(item.paymentMethodId)) + Number(item.usageFrequency !== "UNKNOWN") + Number(Boolean(item.lastReviewedAt));
  }, 0);
  const dataQuality = active.length ? Math.round((filledFields / (active.length * 4)) * 100) : 100;
  const budgetExceeded = Boolean(budget && monthlyTotal > budget);
  const budgetPenalty = budgetExceeded ? Math.min(20, Math.round(((monthlyTotal - (budget ?? 0)) / monthlyTotal) * 30)) : 0;
  const operationScore = Math.max(0, 100 - Math.min(30, urgentItems.length * 10) - Math.min(25, reviewPriorityCount * 5) - Math.min(15, lowUsageCount * 5) - Math.max(0, 80 - dataQuality) - budgetPenalty);
  const categoryTotals = active.reduce<Record<string, number>>((acc, item) => {
    const name = item.category?.name ?? "未分類";
    acc[name] = (acc[name] ?? 0) + monthly(item.price, item.billingCycle, item.customCycleDays);
    return acc;
  }, {});

  return (
    <AppShell>
      <PageHeader title="ダッシュボード" description="登録済みサブスクリプションの月額、更新予定、期限リスク、見直し候補を確認します。" action={<Link href="/subscriptions/new" className="btn-primary">サブスク追加</Link>} />
      <SetupChecklistCard subscriptionCount={allSubscriptions.length} hasCategory={active.some((item) => Boolean(item.categoryId))} hasPaymentMethod={active.some((item) => Boolean(item.paymentMethodId))} hasBudget={Boolean(budget)} hasReviewData={active.some((item) => item.usageFrequency !== "UNKNOWN" && Boolean(item.lastReviewedAt))} />
      <PlanLimitBanner hiddenCount={hiddenCount} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["月額合計", yen.format(monthlyTotal), "from-blue-600 to-cyan-500"],
          ["年額換算", yen.format(monthlyTotal * MONTHS_PER_YEAR), "from-slate-900 to-blue-700"],
          ["アクティブ件数", `${active.length}件`, "from-emerald-500 to-teal-500"],
          ["予算消化", budget ? `${budgetRate}%` : "未設定", "from-fuchsia-500 to-rose-500"],
        ].map(([label, value, gradient]) => (
          <Card key={label} className="relative overflow-hidden">
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${gradient}`} />
            <p className="text-sm font-black text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
          </Card>
        ))}
      </div>
      <PremiumValueCard monthlyTotal={monthlyTotal} saving={saving} reviewCount={reviewItems.length} urgentCount={urgentItems.length} />
      <OperationalCommandCard score={operationScore} dataQuality={dataQuality} urgentCount={urgentItems.length} reviewCount={reviewPriorityCount} lowUsageCount={lowUsageCount} budgetRate={budget ? budgetRate : 0} budgetExceeded={budgetExceeded} />
      {budget && (
        <Card className="mt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold">月額予算</h2>
              <p className="mt-1 text-sm text-slate-600">予算 {yen.format(budget)} に対して現在 {yen.format(monthlyTotal)} です。{monthlyTotal > budget ? `超過額は ${yen.format(monthlyTotal - budget)} です。` : `残り ${yen.format(budget - monthlyTotal)} 使えます。`}</p>
            </div>
            <Link href="/review" className="btn-primary">削減候補を見る</Link>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${budgetRate > 100 ? "bg-red-500" : "bg-blue-600"}`} style={{ width: `${Math.min(100, budgetRate)}%` }} />
          </div>
        </Card>
      )}
      <div className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <h2 className="text-lg font-bold">次回更新予定</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {active.length === 0 ? <EmptyState text="登録済みのサブスクリプションはありません。" /> : active.slice(0, 5).map((item) => (
              <Link key={item.id} href={`/subscriptions/${item.id}`} className="flex items-center justify-between gap-4 py-3">
                <div><p className="font-semibold">{item.name}</p><p className="text-sm text-slate-500">{isoDate(item.nextBillingDate)} / {daysUntil(item.nextBillingDate)}日後</p></div>
                <p className="font-bold">{yen.format(monthly(item.price, item.billingCycle, item.customCycleDays))}/月</p>
              </Link>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">カテゴリ別支出</h2>
          <div className="mt-4 space-y-3">
            {Object.keys(categoryTotals).length === 0 ? <EmptyState text="集計対象のデータはありません。" /> : Object.entries(categoryTotals).map(([name, total]) => (
              <div key={name} className="flex justify-between rounded-lg border border-slate-100 bg-white/70 p-3 text-sm shadow-sm"><span className="font-bold">{name}</span><span className="font-black">{yen.format(total)}</span></div>
            ))}
          </div>
        </Card>
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-bold">期限アラート</h2>
            <Link href="/review" className="text-sm font-semibold text-blue-700">見直しへ</Link>
          </div>
          <div className="mt-4 divide-y divide-slate-100">
            {urgentItems.length === 0 ? <EmptyState text="7日以内に対応が必要な契約はありません。" /> : urgentItems.slice(0, 5).map((item) => (
              <Link key={item.id} href={`/subscriptions/${item.id}`} className="block py-3">
                <p className="font-semibold">{item.name}</p>
                <p className="text-sm text-slate-500">更新 {dateText(item.nextBillingDate)} / トライアル {dateText(item.trialEndsAt)} / 解約期限 {dateText(item.cancellationDeadline)}</p>
              </Link>
            ))}
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-bold">見直し候補</h2>
            <Link href="/review" className="text-sm font-semibold text-blue-700">すべて見る</Link>
          </div>
          <div className="mt-4 divide-y divide-slate-100">
            {reviewItems.length === 0 ? <EmptyState text="見直しが必要な契約はありません。" /> : reviewItems.slice(0, 5).map((item) => (
              <Link key={item.id} href={`/subscriptions/${item.id}`} className="flex justify-between gap-4 py-3">
                <span className="font-semibold">{item.name}</span>
                <span className="text-sm text-slate-500">最終見直し {dateText(item.lastReviewedAt)}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

export async function SubscriptionsView() {
  const user = await requireVerifiedUser();
  const allSubscriptions = (await prisma.subscription.findMany({
    where: { userId: user.id, deletedAt: null },
    include: { category: true, paymentMethod: true },
    orderBy: { nextBillingDate: "asc" },
  })) as unknown as SubscriptionView[];
  const subscriptions = limitByPlan(allSubscriptions, user.plan);
  const hiddenCount = hiddenByPlan(allSubscriptions.length, user.plan);
  return (
    <AppShell>
      <PageHeader title="サブスク一覧" description="登録済みサブスクリプションだけを表示します。" action={<Link href="/subscriptions/new" className="btn-primary">新規登録</Link>} />
      <PlanLimitBanner hiddenCount={hiddenCount} />
      {subscriptions.length === 0 ? <Card><EmptyState text="まだサブスクリプションが登録されていません。" /></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {subscriptions.map((item) => (
            <Link key={item.id} href={`/subscriptions/${item.id}`} className="group rounded-lg border border-white/75 bg-white/92 p-5 shadow-[0_14px_35px_rgba(15,23,42,0.07)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_22px_48px_rgba(37,99,235,0.14)]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  {serviceIcon(item) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={serviceIcon(item) ?? ""} alt="" className="size-10 rounded-lg border border-slate-100 bg-white object-contain p-1 shadow-sm" />
                  ) : (
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-sm font-black text-blue-700">{item.name.slice(0, 1)}</span>
                  )}
                  <div className="min-w-0"><p className="truncate text-lg font-bold">{item.name}</p><p className="mt-1 text-sm text-slate-500">{item.category?.name ?? "未分類"}</p></div>
                </div>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{statusLabel(item.status)}</span>
              </div>
              <p className="mt-5 text-3xl font-black text-slate-950">{yen.format(monthly(item.price, item.billingCycle, item.customCycleDays))}</p>
              <div className="mt-4 rounded-lg bg-slate-50/80 p-3 text-sm font-semibold text-slate-600">
                次回更新 {isoDate(item.nextBillingDate)} / {item.paymentMethod?.name ?? "未設定"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}

export async function SubscriptionFormView({ id }: { id?: string }) {
  const user = await requireVerifiedUser();
  const [subscription, categories, paymentMethods] = await Promise.all([
    id ? prisma.subscription.findFirst({ where: { id, userId: user.id, deletedAt: null } }) : Promise.resolve(null),
    prisma.category.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    prisma.paymentMethod.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
  ]);
  if (id && !subscription) notFound();
  if (!id && !isPremiumPlan(user.plan)) {
    const count = await prisma.subscription.count({ where: { userId: user.id, deletedAt: null } });
    if (count >= FREE_SUBSCRIPTION_LIMIT) {
      return <AppShell><PageHeader title="サブスク登録" description="Freeプランの登録上限に達しています。" /><PremiumOnlyNotice title="Freeプランの登録上限に達しています" description={`Freeプランではサブスク登録は${FREE_SUBSCRIPTION_LIMIT}件までです。Premiumに変更すると無制限に登録できます。`} /></AppShell>;
    }
  }
  return (
    <AppShell>
      <PageHeader title={subscription ? "サブスク編集" : "サブスク登録"} description="サブスクリプション情報をDBへ保存します。" />
      <Card><SubscriptionForm subscription={subscription} categories={categories} paymentMethods={paymentMethods} /></Card>
    </AppShell>
  );
}

export async function SubscriptionDetailView({ id }: { id: string }) {
  const user = await requireVerifiedUser();
  const item = (await prisma.subscription.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    include: { category: true, paymentMethod: true, paymentHistories: { orderBy: { paidAt: "desc" } } },
  })) as unknown as SubscriptionView | null;
  if (!item) notFound();
  const sameCategoryCount = item.categoryId
    ? await prisma.subscription.count({ where: { userId: user.id, deletedAt: null, status: "ACTIVE", categoryId: item.categoryId } })
    : 1;
  const score = reviewScore(item, sameCategoryCount);
  const saving = estimatedMonthlySaving(item);
  const cancellationPageUrl = safeExternalUrl(item.cancellationUrl);
  let checklist = (await prisma.cancellationChecklistItem.findMany({
    where: { subscriptionId: item.id, userId: user.id },
    orderBy: { sortOrder: "asc" },
  })) as unknown as CancellationChecklistView[];
  if (checklist.length === 0) {
    await prisma.cancellationChecklistItem.createMany({
      data: defaultCancellationChecklist.map((label, index) => ({
        subscriptionId: item.id,
        userId: user.id,
        label,
        sortOrder: index + 1,
      })),
    });
    checklist = (await prisma.cancellationChecklistItem.findMany({
      where: { subscriptionId: item.id, userId: user.id },
      orderBy: { sortOrder: "asc" },
    })) as unknown as CancellationChecklistView[];
  }
  const evidences = (await prisma.cancellationEvidence.findMany({
    where: { subscriptionId: item.id, userId: user.id },
    orderBy: { recordedAt: "desc" },
  })) as unknown as CancellationEvidenceView[];
  const completedChecklistCount = checklist.filter((entry) => entry.completedAt).length;
  return (
    <AppShell>
      <PageHeader title={item.name} description="登録内容、次回更新日、年間換算額を確認します。" action={<Link href={`/subscriptions/${item.id}/edit`} className="btn-primary">編集</Link>} />
      <div className="grid gap-5 lg:grid-cols-[1fr_0.75fr]">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Info label="月額換算" value={yen.format(monthly(item.price, item.billingCycle, item.customCycleDays))} />
            <Info label="年額換算" value={yen.format(annualAmount(item.price, item.billingCycle, item.customCycleDays))} />
            <Info label="次回更新日" value={isoDate(item.nextBillingDate)} />
            <Info label="ステータス" value={item.status} />
            <Info label="カテゴリ" value={item.category?.name ?? "未分類"} />
            <Info label="支払い方法" value={item.paymentMethod?.name ?? "未設定"} />
            <Info label="無料トライアル終了日" value={dateText(item.trialEndsAt)} />
            <Info label="解約期限" value={dateText(item.cancellationDeadline)} />
            <Info label="最終見直し日" value={dateText(item.lastReviewedAt)} />
            <Info label="利用頻度" value={usageLabel(item.usageFrequency)} />
            <Info label="重要度" value={priorityLabel(item.priority)} />
            <Info label="解約状態" value={cancellationLabel(item.cancellationStatus)} />
          </div>
          <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50/80 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black text-blue-800">見直しスコア</p>
                <p className="mt-1 text-3xl font-black text-blue-950">{score.score}<span className="text-base"> / 100</span></p>
              </div>
              <div className="rounded-full bg-white px-4 py-2 text-sm font-black text-blue-800 shadow-sm">{score.grade}</div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {score.reasons.map((reason) => <span key={reason} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700">{reason}</span>)}
            </div>
            <p className="mt-4 text-sm font-semibold text-blue-900">削減見込み: 月 {yen.format(saving)} / 年 {yen.format(saving * MONTHS_PER_YEAR)}</p>
          </div>
          <p className="mt-5 rounded-lg border border-slate-100 bg-slate-50/80 p-4 text-sm font-medium leading-6 text-slate-600">{item.memo || "メモは登録されていません。"}</p>
        </Card>
        <Card>
          <h2 className="mb-4 font-bold">操作</h2>
          <SubscriptionActions id={item.id} />
          <div className="mt-5 border-t border-slate-200 pt-5">
            {isPremiumPlan(user.plan) ? <AiRecommendationsPanel subscriptionId={item.id} serviceName={item.name} /> : <PremiumOnlyNotice title="AI乗り換え診断" description="AIによる代替候補、統合、解約検討はPremium限定です。" />}
          </div>
        </Card>
      </div>
      {isPremiumPlan(user.plan) ? (
        <>
          <Card className="mt-5">
            <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <h2 className="text-lg font-bold">解約支援</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">解約を検討してから完了するまでの状態、予定日、問い合わせ番号や手順メモを残します。</p>
                <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                  <p className="text-sm font-black text-slate-700">進捗 {completedChecklistCount}/{checklist.length}</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-blue-600" style={{ width: `${checklist.length ? Math.round((completedChecklistCount / checklist.length) * 100) : 0}%` }} />
                  </div>
                </div>
                {cancellationPageUrl && <Link href={cancellationPageUrl} target="_blank" rel="noreferrer" className="btn-secondary mt-4 inline-flex">解約ページを開く</Link>}
              </div>
              <CancellationPlanForm id={item.id} status={item.cancellationStatus} plannedCancelAt={item.plannedCancelAt} memo={item.cancellationMemo} />
            </div>
          </Card>
          <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <h2 className="text-lg font-bold">解約チェックリスト</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">解約忘れ、証跡不足、次回請求の見落としを防ぐための手順です。</p>
              <div className="mt-4"><CancellationChecklist items={checklist} /></div>
            </Card>
            <Card>
              <h2 className="text-lg font-bold">解約証跡</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">受付番号、完了メール、スクリーンショットURL、確認メモを残します。</p>
              <div className="mt-5"><CancellationEvidenceForm subscriptionId={item.id} /></div>
              <div className="mt-5 divide-y divide-slate-100">
                {evidences.length === 0 ? <EmptyState text="証跡はまだ登録されていません。" /> : evidences.map((evidence) => (
                  <div key={evidence.id} className="flex items-start justify-between gap-3 py-3">
                    <div>
                      <p className="font-bold">{evidence.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{isoDate(evidence.recordedAt)} / {evidenceKindLabel(evidence.kind)}</p>
                      {evidence.referenceUrl && <Link href={evidence.referenceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-semibold text-blue-700">参照URLを開く</Link>}
                      {evidence.memo && <p className="mt-2 text-sm leading-6 text-slate-600">{evidence.memo}</p>}
                    </div>
                    <DeleteCancellationEvidenceButton id={evidence.id} />
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      ) : (
        <div className="mt-5"><PremiumOnlyNotice title="解約チェックリスト・証跡管理" description="解約予定、チェックリスト、受付番号や完了メールなどの証跡管理はPremium限定です。" /></div>
      )}
      <Card className="mt-5">
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="font-bold">支払い履歴登録</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">請求・カード明細・口座引落を確認したら、支払い済みとして記録します。</p>
            <div className="mt-4">
              <PaymentHistoryForm subscriptionId={item.id} defaultAmount={item.price} />
            </div>
          </div>
          <div>
            <h2 className="font-bold">支払い履歴</h2>
            <div className="mt-4">
          {item.paymentHistories.length === 0 ? <EmptyState text="支払い履歴はまだ登録されていません。" /> : item.paymentHistories.map((history) => (
            <div key={history.id} className="flex items-center justify-between gap-3 border-b border-slate-100 py-3">
              <div>
                <p className="font-bold">{isoDate(history.paidAt)} / {yen.format(history.amount)}</p>
                {history.memo && <p className="mt-1 text-sm text-slate-500">{history.memo}</p>}
              </div>
              <DeletePaymentHistoryButton id={history.id} />
            </div>
          ))}
            </div>
          </div>
        </div>
      </Card>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-100 bg-white/70 p-4 shadow-sm"><p className="text-sm font-bold text-slate-500">{label}</p><p className="mt-1 font-black text-slate-950">{value}</p></div>;
}

export async function CategoriesView() {
  const user = await requireVerifiedUser();
  const categories = (await prisma.category.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } })) as unknown as CategoryView[];
  return <AppShell><PageHeader title="カテゴリ管理" description="ユーザーのカテゴリだけを管理します。" /><div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]"><Card><CategoryForm /></Card><Card><div className="grid gap-3 sm:grid-cols-2">{categories.length === 0 ? <EmptyState text="カテゴリがありません。" /> : categories.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white/70 p-4 shadow-sm"><span className="size-4 rounded-full shadow-sm" style={{ backgroundColor: item.color }} /><span className="font-bold">{item.name}</span></div>)}</div></Card></div></AppShell>;
}

export async function PaymentMethodsView() {
  const user = await requireVerifiedUser();
  const methods = (await prisma.paymentMethod.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } })) as unknown as PaymentMethodView[];
  return <AppShell><PageHeader title="支払い方法" description="ユーザーの支払い方法だけを管理します。" /><div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]"><Card><PaymentMethodForm /></Card><Card><div className="divide-y divide-slate-100">{methods.length === 0 ? <EmptyState text="支払い方法がありません。" /> : methods.map((item) => <div key={item.id} className="py-3"><p className="font-semibold">{item.name}</p><p className="text-sm text-slate-500">{paymentMethodTypeLabels[item.type] ?? item.type}{item.memo ? ` / ${item.memo}` : ""}</p></div>)}</div></Card></div></AppShell>;
}

export async function PaymentsView() {
  const user = await requireVerifiedUser();
  const today = new Date();
  const currentKey = yearMonthKey(today);
  const allSubscriptions = (await prisma.subscription.findMany({
    where: { userId: user.id, deletedAt: null, status: "ACTIVE" },
    include: {
      category: true,
      paymentMethod: true,
      paymentHistories: { orderBy: { paidAt: "desc" }, take: 12 },
    },
    orderBy: { nextBillingDate: "asc" },
  })) as unknown as SubscriptionView[];
  const subscriptions = limitByPlan(allSubscriptions, user.plan);
  const hiddenCount = hiddenByPlan(allSubscriptions.length, user.plan);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const currentMonthHistories = (await prisma.paymentHistory.findMany({
    where: { userId: user.id, paidAt: { gte: monthStart, lt: nextMonth } },
    include: { subscription: true },
    orderBy: { paidAt: "desc" },
  })) as unknown as PaymentHistoryView[];
  const paidTotal = currentMonthHistories.reduce((sum, item) => sum + item.amount, 0);
  const dueThisMonth = subscriptions.filter((item) => yearMonthKey(item.nextBillingDate) === currentKey);
  const confirmedThisMonth = dueThisMonth.filter((item) => item.paymentHistories.some((history) => yearMonthKey(history.paidAt) === currentKey));
  const awaiting = subscriptions.filter((item) => daysUntil(item.nextBillingDate) <= 0 && !item.paymentHistories.some((history) => yearMonthKey(history.paidAt) === yearMonthKey(item.nextBillingDate)));
  const upcoming30 = subscriptions.filter((item) => daysUntil(item.nextBillingDate) >= 0 && daysUntil(item.nextBillingDate) <= 30);

  return (
    <AppShell>
      <PageHeader title="支払い確認" description="請求・カード明細・口座引落の確認結果を記録し、未確認の支払いを見逃さないようにします。" />
      <PlanLimitBanner hiddenCount={hiddenCount} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["今月の支払い記録", yen.format(paidTotal)],
          ["今月更新予定", `${dueThisMonth.length}件`],
          ["今月確認済み", `${confirmedThisMonth.length}件`],
          ["未確認・期限超過", `${awaiting.length}件`],
        ].map(([label, value]) => (
          <Card key={label}><p className="text-sm font-black text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></Card>
        ))}
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <h2 className="text-lg font-bold">支払いを記録</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Scalebaseの入金消込に近い考え方で、支払い確認済みの履歴を登録します。</p>
          <div className="mt-5">
            <PaymentHistoryForm subscriptions={subscriptions.map((item) => ({ id: item.id, name: item.name, price: item.price }))} />
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-bold">直近30日の確認対象</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {upcoming30.length === 0 ? <EmptyState text="直近30日に確認が必要な支払いはありません。" /> : upcoming30.map((item) => {
              const confirmed = item.paymentHistories.some((history) => yearMonthKey(history.paidAt) === yearMonthKey(item.nextBillingDate));
              return (
                <Link key={item.id} href={`/subscriptions/${item.id}`} className="grid gap-3 py-3 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <p className="font-bold">{item.name}</p>
                    <p className="mt-1 text-sm text-slate-500">更新 {dateText(item.nextBillingDate)} / {item.paymentMethod?.name ?? "支払い方法未設定"}</p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="font-black">{yen.format(item.price)}</p>
                    <p className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-black ${confirmed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      {confirmed ? "確認済み" : "未確認"}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="text-lg font-bold">最近の支払い履歴</h2>
        <div className="mt-4 divide-y divide-slate-100">
          {currentMonthHistories.length === 0 ? <EmptyState text="今月の支払い履歴はまだありません。" /> : currentMonthHistories.map((history) => (
            <div key={history.id} className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
              <div>
                <Link href={`/subscriptions/${history.subscriptionId}`} className="font-bold text-slate-950 hover:text-blue-700">{history.subscription.name}</Link>
                <p className="mt-1 text-sm text-slate-500">{dateText(history.paidAt)}{history.memo ? ` / ${history.memo}` : ""}</p>
              </div>
              <div className="flex items-center justify-between gap-3 md:justify-end">
                <p className="font-black">{yen.format(history.amount)}</p>
                <DeletePaymentHistoryButton id={history.id} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}

export async function PaymentTotalsView() {
  const user = await requireVerifiedUser();
  if (!isPremiumPlan(user.plan)) return <AppShell><PageHeader title="支払い累計" description="全期間の支払い累計を確認します。" /><PremiumOnlyNotice title="支払い累計はPremium限定です" description="月別累計グラフ、支払い方法別集計、サブスク別ランキングはPremiumで利用できます。" /></AppShell>;
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const histories = (await prisma.paymentHistory.findMany({
    where: { userId: user.id, paidAt: { lte: todayEnd } },
    include: {
      subscription: {
        include: {
          category: true,
          paymentMethod: true,
        },
      },
    },
    orderBy: { paidAt: "asc" },
  })) as unknown as PaymentHistoryView[];

  const totalPaid = histories.reduce((sum, item) => sum + item.amount, 0);
  const uniqueSubscriptions = new Set(histories.map((item) => item.subscriptionId)).size;
  const firstMonth = histories[0] ? monthFromKey(yearMonthKey(histories[0].paidAt)) : addMonths(new Date(), -11);
  const lastMonth = histories[0] ? monthFromKey(yearMonthKey(histories[histories.length - 1].paidAt)) : new Date();
  const visibleStart = histories.length ? firstMonth : addMonths(new Date(), -11);
  const visibleEnd = histories.length ? lastMonth : new Date();
  const months = monthRange(visibleStart, visibleEnd);

  const monthlyTotals = months.map((month) => {
    const rows = histories.filter((item) => yearMonthKey(item.paidAt) === month);
    const total = rows.reduce((sum, item) => sum + item.amount, 0);
    return { month, count: rows.length, total };
  });
  const monthlyRows = monthlyTotals.reduce<Array<{ month: string; count: number; total: number; runningTotal: number }>>((rows, item) => {
    const previous = rows.at(-1)?.runningTotal ?? 0;
    return [...rows, { ...item, runningTotal: previous + item.total }];
  }, []);
  const averageMonthly = months.length ? totalPaid / months.length : 0;
  const bestMonth = monthlyTotals.reduce((best, item) => item.total > best.total ? item : best, { month: "-", count: 0, total: 0 });
  const maxMonthly = Math.max(...monthlyTotals.map((item) => item.total), 1);

  const categoryTotals = histories.reduce<Record<string, { total: number; count: number }>>((acc, item) => {
    const name = item.subscription.category?.name ?? "未分類";
    acc[name] = acc[name] ?? { total: 0, count: 0 };
    acc[name].total += item.amount;
    acc[name].count += 1;
    return acc;
  }, {});
  const methodTotals = histories.reduce<Record<string, { total: number; count: number }>>((acc, item) => {
    const name = item.subscription.paymentMethod?.name ?? "未設定";
    acc[name] = acc[name] ?? { total: 0, count: 0 };
    acc[name].total += item.amount;
    acc[name].count += 1;
    return acc;
  }, {});
  const subscriptionTotals = histories.reduce<Record<string, { total: number; count: number; category: string }>>((acc, item) => {
    const name = item.subscription.name;
    acc[name] = acc[name] ?? { total: 0, count: 0, category: item.subscription.category?.name ?? "未分類" };
    acc[name].total += item.amount;
    acc[name].count += 1;
    return acc;
  }, {});

  const categoryEntries = Object.entries(categoryTotals).sort((a, b) => b[1].total - a[1].total);
  const methodEntries = Object.entries(methodTotals).sort((a, b) => b[1].total - a[1].total);
  const ranking = Object.entries(subscriptionTotals).sort((a, b) => b[1].total - a[1].total).slice(0, 10);
  const recentHistories = [...histories].sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime()).slice(0, 12);

  return (
    <AppShell>
      <PageHeader
        title="支払い累計"
        description="これまでに記録した支払いの累計、月別推移、カテゴリ別・支払い方法別の構成を確認します。"
        action={<Link href="/payments" className="btn-primary">支払いを記録</Link>}
      />

      <Card className="mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">PAYMENT REPORT</p>
            <h2 className="mt-3 text-xl font-black text-slate-950">支払い履歴を累計レポート化</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600">支払い確認で記録したデータをもとに、固定費の実績推移を見える化します。</p>
          </div>
          <Link href="/api/export" className="btn-secondary">CSVダウンロード</Link>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["累計支払い", yen.format(totalPaid)],
          ["支払い記録", `${histories.length}件`],
          ["対象サブスク", `${uniqueSubscriptions}件`],
          ["月平均", yen.format(averageMonthly)],
          ["最大月", bestMonth.month === "-" ? "-" : `${bestMonth.month} / ${yen.format(bestMonth.total)}`],
        ].map(([label, value]) => (
          <Card key={label} className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 to-cyan-500" />
            <p className="text-sm font-black text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="min-w-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-bold">月別 支払い累計グラフ</h2>
              <p className="mt-1 text-sm text-slate-500">{months[0] ?? "-"}〜{months[months.length - 1] ?? "-"}</p>
            </div>
            <p className="text-sm font-bold text-slate-500">データがない月は0円</p>
          </div>
          {histories.length === 0 ? (
            <div className="mt-5"><EmptyState text="支払い履歴がありません。" /></div>
          ) : (
            <div className="mt-6 flex h-80 items-end gap-2 overflow-x-auto border-b border-slate-200 pb-3">
              {monthlyTotals.map((item) => (
                <div key={item.month} className="flex min-w-14 flex-1 flex-col items-center justify-end gap-2">
                  <div className="flex h-56 w-full items-end justify-center rounded-lg bg-slate-50 px-2">
                    <div
                      className="w-full rounded-t-lg bg-gradient-to-t from-blue-600 to-cyan-400 shadow-sm"
                      style={{ height: `${Math.max(4, Math.round((item.total / maxMonthly) * 100))}%` }}
                      title={`${item.month}: ${yen.format(item.total)}`}
                    />
                  </div>
                  <p className="text-center text-[11px] font-black text-slate-700">{yen.format(item.total).replace("￥", "¥")}</p>
                  <p className="text-center text-[11px] font-bold text-slate-500">{item.month.slice(2)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="min-w-0">
          <h2 className="text-lg font-bold">支払い方法別 構成</h2>
          <p className="mt-1 text-sm text-slate-500">全期間の支払い方法ごとの累計です。</p>
          <div className="mt-5 space-y-4">
            {methodEntries.length === 0 ? <EmptyState text="集計対象がありません。" /> : methodEntries.map(([name, data], index) => (
              <AnalyticsBar key={name} label={`${index + 1}. ${name}`} value={data.total} total={totalPaid} color={chartColors[index % chartColors.length]} />
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold">カテゴリ別 支払い集計</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="px-4 py-3 text-left font-bold text-slate-600">カテゴリ</th>
                  <th className="px-4 py-3 text-right font-bold text-slate-600">件数</th>
                  <th className="px-4 py-3 text-right font-bold text-slate-600">支払い累計</th>
                  <th className="px-4 py-3 text-right font-bold text-slate-600">構成比</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categoryEntries.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-5 text-center text-slate-500">集計対象がありません。</td></tr>
                ) : categoryEntries.map(([name, data]) => (
                  <tr key={name}>
                    <td className="px-4 py-3 font-bold">{name}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{data.count}件</td>
                    <td className="px-4 py-3 text-right font-black">{yen.format(data.total)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{percent(data.total, totalPaid)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-bold">月別 支払い集計</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="px-4 py-3 text-left font-bold text-slate-600">月</th>
                  <th className="px-4 py-3 text-right font-bold text-slate-600">件数</th>
                  <th className="px-4 py-3 text-right font-bold text-slate-600">支払い額</th>
                  <th className="px-4 py-3 text-right font-bold text-slate-600">累計</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthlyRows.map((item) => (
                  <tr key={item.month}>
                    <td className="px-4 py-3 font-bold">{item.month}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{item.count}件</td>
                    <td className="px-4 py-3 text-right font-black">{yen.format(item.total)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{yen.format(item.runningTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <h2 className="text-lg font-bold">サブスク別 支払いランキング</h2>
          <p className="mt-1 text-sm text-slate-500">全期間の支払い累計が高い順です。</p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="px-4 py-3 text-center font-bold text-slate-600">順位</th>
                  <th className="px-4 py-3 text-left font-bold text-slate-600">サブスク</th>
                  <th className="px-4 py-3 text-right font-bold text-slate-600">件数</th>
                  <th className="px-4 py-3 text-right font-bold text-slate-600">支払い累計</th>
                  <th className="px-4 py-3 text-right font-bold text-slate-600">構成比</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ranking.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-5 text-center text-slate-500">集計対象がありません。</td></tr>
                ) : ranking.map(([name, data], index) => (
                  <tr key={name}>
                    <td className="px-4 py-3 text-center font-black text-blue-700">{index + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-bold">{name}</p>
                      <p className="mt-1 text-xs text-slate-500">{data.category}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">{data.count}件</td>
                    <td className="px-4 py-3 text-right font-black">{yen.format(data.total)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{percent(data.total, totalPaid)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-bold">最近の支払い</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {recentHistories.length === 0 ? <EmptyState text="支払い履歴がありません。" /> : recentHistories.map((history) => (
              <Link key={history.id} href={`/subscriptions/${history.subscriptionId}`} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-bold">{history.subscription.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{dateText(history.paidAt)} / {history.subscription.paymentMethod?.name ?? "未設定"}</p>
                </div>
                <p className="font-black">{yen.format(history.amount)}</p>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonth(value?: string) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return monthKey(new Date());
  const [, month] = value.split("-").map(Number);
  if (month < 1 || month > 12) return monthKey(new Date());
  return value;
}

function shiftMonth(value: string, offset: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return `${year}年${month}月`;
}

function dateKeyFromParts(year: number, monthIndex: number, day: number) {
  return isoDate(new Date(Date.UTC(year, monthIndex, day)));
}

function dateKey(value: Date) {
  return isoDate(value);
}

export async function CalendarView({ month }: { month?: string }) {
  const user = await requireVerifiedUser();
  const selectedMonth = parseMonth(month);
  const [year, monthNumber] = selectedMonth.split("-").map(Number);
  const monthIndex = monthNumber - 1;
  const firstDay = new Date(Date.UTC(year, monthIndex, 1));
  const firstWeekday = firstDay.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const leadingDays = Array.from({ length: firstWeekday }, () => null);
  const monthDays = Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const trailingDays = Array.from({ length: (7 - ((leadingDays.length + monthDays.length) % 7)) % 7 }, () => null);
  const cells = [...leadingDays, ...monthDays, ...trailingDays];
  const monthStart = new Date(Date.UTC(year, monthIndex, 1));
  const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 1));
  const todayKey = dateKey(new Date());

  const allSubscriptions = (await prisma.subscription.findMany({
    where: {
      userId: user.id,
      deletedAt: null,
      status: "ACTIVE",
      nextBillingDate: {
        gte: monthStart,
        lt: monthEnd,
      },
    },
    include: { category: true, paymentMethod: true },
    orderBy: [{ nextBillingDate: "asc" }, { name: "asc" }],
  })) as unknown as SubscriptionView[];
  const subscriptions = limitByPlan(allSubscriptions, user.plan);
  const hiddenCount = hiddenByPlan(allSubscriptions.length, user.plan);

  const byDate = subscriptions.reduce<Record<string, typeof subscriptions>>((acc, item) => {
    const key = dateKey(item.nextBillingDate);
    acc[key] = acc[key] ? [...acc[key], item] : [item];
    return acc;
  }, {});

  return (
    <AppShell>
      <PageHeader
        title="更新日カレンダー"
        description="月ごとのカレンダーで、更新日に該当するサブスクリプションを確認します。"
        action={<Link href="/subscriptions/new" className="btn-primary">サブスク追加</Link>}
      />
      <PlanLimitBanner hiddenCount={hiddenCount} />
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">表示月</p>
            <h2 className="mt-1 text-2xl font-black">{monthLabel(selectedMonth)}</h2>
          </div>
          <div className="flex gap-2">
            <Link href={`/calendar?month=${shiftMonth(selectedMonth, -1)}`} className="btn-secondary min-h-0 px-4 py-2 text-sm">前月</Link>
            <Link href={`/calendar?month=${monthKey(new Date())}`} className="btn-secondary min-h-0 px-4 py-2 text-sm">今月</Link>
            <Link href={`/calendar?month=${shiftMonth(selectedMonth, 1)}`} className="btn-secondary min-h-0 px-4 py-2 text-sm">翌月</Link>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-7 overflow-hidden rounded-lg border border-white/80 bg-white/80 shadow-sm">
          {["日", "月", "火", "水", "木", "金", "土"].map((day, index) => (
            <div key={day} className={`border-b border-slate-100 bg-slate-50/90 px-2 py-3 text-center text-sm font-black ${index === 0 ? "text-red-600" : index === 6 ? "text-blue-600" : "text-slate-600"}`}>
              {day}
            </div>
          ))}
          {cells.map((day, index) => {
            const key = day ? dateKeyFromParts(year, monthIndex, day) : "";
            const items = key ? byDate[key] ?? [] : [];
            const isToday = key === todayKey;
            return (
              <div key={`${index}-${day ?? "blank"}`} className={`min-h-36 border-b border-r border-slate-100 p-2 ${day ? "bg-white/88" : "bg-slate-50/70"} ${isToday ? "ring-2 ring-inset ring-blue-500" : ""}`}>
                {day && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className={`grid size-7 place-items-center rounded-full text-sm font-bold ${isToday ? "bg-blue-600 text-white" : "text-slate-700"}`}>{day}</span>
                      {items.length > 0 && <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{items.length}件</span>}
                    </div>
                    <div className="mt-2 space-y-2">
                      {items.map((item) => (
                        <Link key={item.id} href={`/subscriptions/${item.id}`} className="block rounded-md border border-slate-100 bg-slate-50/90 p-2 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50">
                          <p className="truncate text-xs font-bold text-slate-900">{item.name}</p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-600">{yen.format(monthly(item.price, item.billingCycle, item.customCycleDays))}/月</p>
                          <p className="mt-1 truncate text-[11px] text-slate-500">{item.category?.name ?? "未分類"}</p>
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {subscriptions.length === 0 && <div className="mt-5"><EmptyState text="この月に更新予定のサブスクリプションはありません。" /></div>}
      </Card>
    </AppShell>
  );
}

export async function AnalyticsView() {
  const user = await requireVerifiedUser();
  if (!isPremiumPlan(user.plan)) return <AppShell><PageHeader title="分析" description="支出割合、上位契約、更新集中、見直し候補をグラフで確認します。" /><PremiumOnlyNotice title="高度分析はPremium限定です" description="カテゴリ比率、支払い方法別分析、上位契約、更新集中、見直し候補のグラフ表示はPremiumで利用できます。" /></AppShell>;
  const subscriptions = (await prisma.subscription.findMany({
    where: { userId: user.id, deletedAt: null },
    include: { category: true, paymentMethod: true },
    orderBy: { nextBillingDate: "asc" },
  })) as unknown as SubscriptionView[];
  const active = subscriptions.filter((item) => item.status === "ACTIVE");
  const monthlyTotal = active.reduce((sum, item) => sum + monthly(item.price, item.billingCycle, item.customCycleDays), 0);
  const annualTotal = monthlyTotal * MONTHS_PER_YEAR;
  const averageMonthly = active.length ? monthlyTotal / active.length : 0;
  const upcoming30 = active.filter((item) => daysUntil(item.nextBillingDate) >= 0 && daysUntil(item.nextBillingDate) <= 30);
  const reviewCount = active.filter((item) => needsReview(item.lastReviewedAt)).length;
  const categoryTotals = active.reduce<Record<string, number>>((acc, item) => {
    const name = item.category?.name ?? "未分類";
    acc[name] = (acc[name] ?? 0) + monthly(item.price, item.billingCycle, item.customCycleDays);
    return acc;
  }, {});
  const methodTotals = active.reduce<Record<string, number>>((acc, item) => {
    const name = item.paymentMethod?.name ?? "未設定";
    acc[name] = (acc[name] ?? 0) + monthly(item.price, item.billingCycle, item.customCycleDays);
    return acc;
  }, {});
  const statusCounts = subscriptions.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});
  const topSubscriptions = [...active]
    .sort((a, b) => monthly(b.price, b.billingCycle, b.customCycleDays) - monthly(a.price, a.billingCycle, a.customCycleDays))
    .slice(0, 8);
  const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
  const categoryEntries = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
  const methodEntries = Object.entries(methodTotals).sort((a, b) => b[1] - a[1]);
  const donut = buildDonut(categoryEntries, monthlyTotal);
  const insight = topCategory
    ? `${topCategory[0]} が月額支出の ${percent(topCategory[1], monthlyTotal)}% を占めています。`
    : "分析対象のサブスクリプションはありません。";

  return (
    <AppShell>
      <PageHeader title="分析" description="支出割合、上位契約、更新集中、見直し候補をグラフで確認します。" action={<Link href="/review" className="btn-primary">見直しへ</Link>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><p className="text-sm font-semibold text-slate-500">月額合計</p><p className="mt-2 text-3xl font-black">{yen.format(monthlyTotal)}</p><p className="mt-2 text-sm text-slate-500">アクティブ {active.length}件</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">年額換算</p><p className="mt-2 text-3xl font-black">{yen.format(annualTotal)}</p><p className="mt-2 text-sm text-slate-500">固定費の年間見込み</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">1契約あたり平均</p><p className="mt-2 text-3xl font-black">{yen.format(averageMonthly)}</p><p className="mt-2 text-sm text-slate-500">月額換算</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">30日以内の更新</p><p className="mt-2 text-3xl font-black">{upcoming30.length}件</p><p className="mt-2 text-sm text-slate-500">未見直し {reviewCount}件</p></Card>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <h2 className="text-lg font-bold">カテゴリ構成</h2>
          {monthlyTotal === 0 ? (
            <EmptyState text="分析対象のデータはありません。" />
          ) : (
            <div className="mt-5 grid gap-5 sm:grid-cols-[180px_1fr] sm:items-center">
              <div className="mx-auto grid size-44 place-items-center rounded-full" style={{ background: donut.gradient }}>
                <div className="grid size-24 place-items-center rounded-full bg-white text-center shadow-sm">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">月額</p>
                    <p className="text-lg font-black">{yen.format(monthlyTotal)}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {categoryEntries.map(([name, total], index) => (
                  <AnalyticsBar key={name} label={name} value={total} total={monthlyTotal} color={chartColors[index % chartColors.length]} />
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-bold">支出インサイト</h2>
          <div className="mt-4 rounded-lg bg-blue-50 p-4 text-sm font-semibold leading-6 text-blue-800">{insight}</div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <MiniMetric label="アクティブ率" value={`${percent(active.length, subscriptions.length)}%`} />
            <MiniMetric label="平均更新間隔" value={`${Math.max(0, Math.round(upcoming30.reduce((sum, item) => sum + daysUntil(item.nextBillingDate), 0) / Math.max(upcoming30.length, 1)))}日`} />
            <MiniMetric label="要見直し率" value={`${percent(reviewCount, active.length)}%`} />
          </div>
          <div className="mt-5 space-y-3">
            {methodEntries.length === 0 ? <EmptyState text="支払い方法別の集計対象はありません。" /> : methodEntries.map(([name, total]) => (
              <AnalyticsBar key={name} label={name} value={total} total={monthlyTotal} color="#0ea5e9" />
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <h2 className="text-lg font-bold">月額上位</h2>
          <div className="mt-4 space-y-3">
            {topSubscriptions.length === 0 ? <EmptyState text="登録済みのアクティブ契約はありません。" /> : topSubscriptions.map((item, index) => {
              const amount = monthly(item.price, item.billingCycle, item.customCycleDays);
              return (
                <Link key={item.id} href={`/subscriptions/${item.id}`} className="grid gap-3 rounded-lg border border-slate-100 bg-white/60 p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 md:grid-cols-[32px_1fr_120px] md:items-center">
                  <span className="grid size-8 place-items-center rounded-full bg-slate-100 text-sm font-black text-slate-600">{index + 1}</span>
                  <div>
                    <p className="font-bold">{item.name}</p>
                    <p className="text-sm text-slate-500">{item.category?.name ?? "未分類"} / {percent(amount, monthlyTotal)}%</p>
                  </div>
                  <p className="font-black md:text-right">{yen.format(amount)}</p>
                </Link>
              );
            })}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-bold">ステータス分布</h2>
          <div className="mt-4 space-y-3">
            {["ACTIVE", "PAUSED", "CANCELLED"].map((status) => (
              <StatusBar key={status} label={statusLabel(status)} value={statusCounts[status] ?? 0} total={subscriptions.length} />
            ))}
          </div>
          <h2 className="mt-7 text-lg font-bold">30日以内の更新</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {upcoming30.length === 0 ? <EmptyState text="30日以内の更新予定はありません。" /> : upcoming30.slice(0, 6).map((item) => (
              <Link key={item.id} href={`/subscriptions/${item.id}`} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-sm text-slate-500">{dateText(item.nextBillingDate)} / {daysUntil(item.nextBillingDate)}日後</p>
                </div>
                <p className="font-bold">{yen.format(monthly(item.price, item.billingCycle, item.customCycleDays))}</p>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

const chartColors = ["#2563eb", "#db2777", "#16a34a", "#f59e0b", "#0891b2", "#7c3aed", "#ef4444", "#64748b"];

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function buildDonut(entries: [string, number][], total: number) {
  if (total === 0 || entries.length === 0) return { gradient: "#e2e8f0" };
  let cursor = 0;
  const segments = entries.map(([, value], index) => {
    const start = cursor;
    const end = cursor + (value / total) * 100;
    cursor = end;
    return `${chartColors[index % chartColors.length]} ${start}% ${end}%`;
  });
  return { gradient: `conic-gradient(${segments.join(", ")})` };
}

function statusLabel(status: string) {
  if (status === "ACTIVE") return "有効";
  if (status === "PAUSED") return "一時停止";
  if (status === "CANCELLED") return "解約済み";
  return status;
}

function planLabel(plan: string) {
  if (plan === "LIFETIME") return "買い切り";
  if (plan === "PREMIUM") return "Premium";
  return "Free";
}

function usageLabel(value: string) {
  if (value === "DAILY") return "毎日使う";
  if (value === "WEEKLY") return "週に数回使う";
  if (value === "MONTHLY") return "月に数回使う";
  if (value === "RARELY") return "ほとんど使っていない";
  return "未設定";
}

function priorityLabel(value: string) {
  if (value === "ESSENTIAL") return "必須";
  if (value === "USEFUL") return "あると便利";
  if (value === "OPTIONAL") return "なくても困らない";
  return "未設定";
}

function cancellationLabel(value: string) {
  if (value === "CONSIDERING") return "検討中";
  if (value === "PLANNED") return "解約予定";
  if (value === "REQUESTED") return "解約申請済み";
  if (value === "COMPLETED") return "解約完了";
  return "未着手";
}

function evidenceKindLabel(value: string) {
  if (value === "REQUEST") return "申請記録";
  if (value === "RECEIPT") return "受付番号";
  if (value === "EMAIL") return "メール";
  if (value === "SCREENSHOT") return "スクリーンショットURL";
  return "メモ";
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-100 bg-white/70 p-4 shadow-sm"><p className="text-sm font-bold text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>;
}

function AnalyticsBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const width = percent(value, total);
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="font-bold">{yen.format(value)} / {width}%</span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function StatusBar({ label, value, total }: { label: string; value: number; total: number }) {
  const width = percent(value, total);
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="font-bold">{value}件 / {width}%</span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-slate-700" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export async function ReviewView() {
  const user = await requireVerifiedUser();
  if (!isPremiumPlan(user.plan)) return <AppShell><PageHeader title="見直しレポート" description="削減見込み、見直しスコア、期限リスクをまとめて判断します。" /><PremiumOnlyNotice title="見直しレポートはPremium限定です" description="削減見込み、見直しスコア、期限リスク、優先順位つきの改善リストはPremiumで利用できます。" /></AppShell>;
  const subscriptions = (await prisma.subscription.findMany({
    where: { userId: user.id, deletedAt: null, status: "ACTIVE" },
    include: { category: true, paymentMethod: true },
    orderBy: { nextBillingDate: "asc" },
  })) as unknown as SubscriptionView[];
  const categoryCounts = subscriptions.reduce<Record<string, number>>((acc, item) => {
    const key = item.categoryId ?? "none";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const scored = subscriptions
    .map((item) => {
      const score = reviewScore(item, categoryCounts[item.categoryId ?? "none"] ?? 1);
      const saving = estimatedMonthlySaving(item);
      return { item, score, saving };
    })
    .sort((a, b) => b.score.score - a.score.score || b.saving - a.saving);
  const totalSaving = scored.reduce((sum, item) => sum + item.saving, 0);
  const urgentCount = scored.filter((item) => item.score.score >= REVIEW_URGENT_SCORE_THRESHOLD).length;
  const expensive = [...subscriptions].sort((a, b) => monthly(b.price, b.billingCycle, b.customCycleDays) - monthly(a.price, a.billingCycle, a.customCycleDays)).slice(0, 5);
  const urgent = subscriptions.filter((item) => daysUntil(item.nextBillingDate) <= UPCOMING_DEADLINE_DAYS || (item.trialEndsAt && daysUntil(item.trialEndsAt) <= UPCOMING_DEADLINE_DAYS) || (item.cancellationDeadline && daysUntil(item.cancellationDeadline) <= UPCOMING_DEADLINE_DAYS));
  const stale = subscriptions.filter((item) => needsReview(item.lastReviewedAt));

  return (
    <AppShell>
      <PageHeader title="見直しレポート" description="削減見込み、見直しスコア、期限リスクをまとめて判断します。" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><p className="text-sm font-semibold text-slate-500">削減見込み</p><p className="mt-2 text-3xl font-black">{yen.format(totalSaving)}</p><p className="mt-2 text-sm text-slate-500">年間 {yen.format(totalSaving * MONTHS_PER_YEAR)}</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">要対応スコア</p><p className="mt-2 text-3xl font-black">{urgentCount}件</p><p className="mt-2 text-sm text-slate-500">70点以上</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">14日以内の対応</p><p className="mt-2 text-3xl font-black">{urgent.length}件</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">未見直し</p><p className="mt-2 text-3xl font-black">{stale.length}件</p></Card>
      </div>
      <Card className="mt-6">
        <h2 className="text-lg font-bold">見直しスコアランキング</h2>
        <div className="mt-4 space-y-3">
          {scored.length === 0 ? <EmptyState text="見直し対象の契約はありません。" /> : scored.map(({ item, score, saving }) => (
            <Link key={item.id} href={`/subscriptions/${item.id}`} className="grid gap-3 rounded-lg border border-slate-100 bg-white/70 p-4 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 lg:grid-cols-[1fr_120px_150px] lg:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">{item.name}</p>
                  <span className={`rounded-full px-2 py-1 text-xs font-black ${score.score >= REVIEW_URGENT_SCORE_THRESHOLD ? "bg-red-50 text-red-700" : score.score >= REVIEW_CAUTION_SCORE_THRESHOLD ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{score.grade}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500">{score.reasons.join(" / ")}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500">スコア</p>
                <p className="text-2xl font-black">{score.score}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500">削減見込み</p>
                <p className="text-lg font-black">{yen.format(saving)}/月</p>
              </div>
            </Link>
          ))}
        </div>
      </Card>
      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        <ReviewList title="対応期限が近い契約" items={urgent} empty="直近で対応が必要な契約はありません。" />
        <ReviewList title="長期間見直していない契約" items={stale} empty="見直しが必要な契約はありません。" />
        <ReviewList title="月額換算が高い契約" items={expensive} empty="契約がありません。" showAmount />
      </div>
    </AppShell>
  );
}

function ReviewList({
  title,
  items,
  empty,
  showAmount = false,
}: {
  title: string;
  items: Array<{
    id: string;
    name: string;
    price: number;
    billingCycle: string;
    customCycleDays?: number | null;
    nextBillingDate: Date;
    trialEndsAt?: Date | null;
    cancellationDeadline?: Date | null;
    lastReviewedAt?: Date | null;
  }>;
  empty: string;
  showAmount?: boolean;
}) {
  return (
    <Card>
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-4 divide-y divide-slate-100">
        {items.length === 0 ? <EmptyState text={empty} /> : items.map((item) => (
          <Link key={item.id} href={`/subscriptions/${item.id}`} className="block py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold">{item.name}</p>
              {showAmount && <p className="text-sm font-bold">{yen.format(monthly(item.price, item.billingCycle, item.customCycleDays))}/月</p>}
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              更新 {dateText(item.nextBillingDate)} / トライアル {dateText(item.trialEndsAt)} / 解約期限 {dateText(item.cancellationDeadline)} / 見直し {dateText(item.lastReviewedAt)}
            </p>
          </Link>
        ))}
      </div>
    </Card>
  );
}

export async function ExportView() {
  const user = await requireVerifiedUser();
  const disabled = !isPremiumPlan(user.plan);
  return (
    <AppShell>
      <PageHeader title="CSV入出力" description="カード明細や既存管理表から候補を検出し、登録済みデータの入出力もできます。" />
      <Card className="mb-5 border-blue-100 bg-blue-50/80">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-blue-950">CSVを迷わず始める</h2>
            <p className="mt-2 text-sm leading-6 text-blue-800">インポート用テンプレートと、明細候補検出を試せるサンプルCSVを用意しました。列名の確認や動作テストに使えます。</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/api/import/template" className="btn-secondary">インポート用テンプレート</Link>
            <Link href="/api/import/statement-sample" className="btn-secondary">明細サンプルCSV</Link>
          </div>
        </div>
      </Card>
      <Card className="mb-5">
        <h2 className="text-lg font-bold">カード・銀行明細からサブスク候補を検出</h2>
        <div className="mt-5"><CsvCandidateDetectorForm disabled={disabled} /></div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold">CSVインポート</h2>
          <div className="mt-5"><CsvImportForm disabled={disabled} /></div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">CSV出力</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">出力項目: サービス名、金額、請求周期、月額換算、年額換算、次回更新日、カテゴリ、支払い方法、ステータス、メモ。</p>
          <CsvDownloadButton disabled={disabled} />
          {disabled && <p className="mt-3 text-sm font-semibold text-amber-700">CSV入出力はPremium限定です。</p>}
        </Card>
      </div>
    </AppShell>
  );
}

export async function NotificationsView() {
  const user = await requireVerifiedUser();
  const allSubscriptions = (await prisma.subscription.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: { nextBillingDate: "asc" },
  })) as unknown as SubscriptionView[];
  const deliveries = await prisma.notificationDelivery.findMany({
    where: { userId: user.id },
    orderBy: { sentAt: "desc" },
    take: 200,
  });
  const subscriptions = limitByPlan(allSubscriptions, user.plan);
  const hiddenCount = hiddenByPlan(allSubscriptions.length, user.plan);
  const lastSentBySubscription = new Map<string, Date>();
  for (const delivery of deliveries) {
    if (!lastSentBySubscription.has(delivery.subscriptionId)) {
      lastSentBySubscription.set(delivery.subscriptionId, delivery.sentAt);
    }
  }
  const now = new Date();
  const nextTargets = subscriptions
    .flatMap((item) => [
      { item, label: "更新日", date: item.nextBillingDate },
      { item, label: "トライアル終了", date: item.trialEndsAt },
      { item, label: "解約期限", date: item.cancellationDeadline },
    ])
    .filter((entry): entry is { item: SubscriptionView; label: string; date: Date } => entry.date instanceof Date && entry.date.getTime() >= now.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <AppShell>
      <PageHeader title="通知" description="更新日、無料トライアル終了、解約期限の通知予定と送信履歴を確認します。" />
      <PlanLimitBanner hiddenCount={hiddenCount} />
      <Card className="mb-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="font-bold">期限通知</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">設定した通知日数と、更新日・トライアル終了日・解約期限が一致したときにメールを送信します。同じ期限への重複送信は自動でスキップします。</p>
          </div>
          <NotificationSendButton />
        </div>
      </Card>
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <h2 className="text-lg font-bold">今後の通知予定</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {nextTargets.length === 0 ? <EmptyState text="今後の通知予定はありません。" /> : nextTargets.slice(0, 10).map(({ item, label, date }) => (
              <Link key={item.id + "-" + label + "-" + date.toISOString()} href={"/subscriptions/" + item.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-sm text-slate-500">{label}: {dateText(date)} / {item.notifyDaysBefore ?? DEFAULT_NOTIFY_DAYS_BEFORE}日前に通知</p>
                </div>
                <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">あと{Math.max(0, daysUntil(date))}日</span>
              </Link>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">サブスク別の送信状況</h2>
          {subscriptions.length === 0 ? (
            <div className="mt-4"><EmptyState text="通知対象のサブスクリプションはありません。" /></div>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {subscriptions.map((item) => {
                const lastSent = lastSentBySubscription.get(item.id);
                return (
                  <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-sm text-slate-500">更新日 {dateText(item.nextBillingDate)} / トライアル {dateText(item.trialEndsAt)} / 解約期限 {dateText(item.cancellationDeadline)}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">最終送信: {lastSent ? dateText(lastSent) : "未送信"}</p>
                    </div>
                    <Link href={"/subscriptions/" + item.id + "/edit"} className="btn-secondary min-h-0 px-3 py-2 text-sm">
                      {item.notifyDaysBefore ?? DEFAULT_NOTIFY_DAYS_BEFORE}日前
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

export async function SettingsView({ checkoutStatus, checkoutSessionId }: { checkoutStatus?: string; checkoutSessionId?: string } = {}) {
  const currentUser = await requireVerifiedUser();
  let checkoutNotice: { type: "success" | "error"; message: string } | null = null;

  if (checkoutStatus === "success") {
    if (!checkoutSessionId) {
      checkoutNotice = { type: "error", message: "決済完了情報を確認できませんでした。もう一度設定画面を更新してください。" };
    } else {
      try {
        const syncStatus = await syncStripeCheckoutSessionById(checkoutSessionId, currentUser.id);
        if (syncStatus === "synced") {
          checkoutNotice = { type: "success", message: "決済が完了しました。プランを更新しました。" };
        } else if (syncStatus === "not_complete") {
          checkoutNotice = { type: "error", message: "Stripe決済がまだ完了していません。しばらく待ってから再読み込みしてください。" };
        } else if (syncStatus === "invalid_user") {
          checkoutNotice = { type: "error", message: "決済情報とログイン中のユーザーが一致しません。" };
        } else {
          checkoutNotice = { type: "error", message: "Stripeの決済情報を確認できませんでした。" };
        }
      } catch (error) {
        console.error("Stripe checkout session sync failed.", error);
        checkoutNotice = { type: "error", message: "Stripe決済の確認に失敗しました。Webhook設定またはStripe設定を確認してください。" };
      }
    }
  } else if (checkoutStatus === "cancelled") {
    checkoutNotice = { type: "error", message: "Stripe決済はキャンセルされました。" };
  }

  const user = await prisma.user.findUnique({
    where: { id: currentUser.id },
    select: { id: true, name: true, email: true, emailVerified: true, plan: true, createdAt: true },
  });
  if (!user) return null;
  const preference = await prisma.userPreference.findUnique({ where: { userId: user.id } });
  return (
    <AppShell>
      <PageHeader title="設定" description="プロフィール、プラン、パスワード、予算、通知の標準値を変更できます。" action={<LogoutButton />} />
      {checkoutNotice && (
        <div className={checkoutNotice.type === "success" ? "mb-5 rounded-lg bg-emerald-50 p-4 text-sm font-semibold text-emerald-700" : "mb-5 rounded-lg bg-red-50 p-4 text-sm font-semibold text-red-700"}>
          {checkoutNotice.message}
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold">プロフィール</h2>
          <p className="mt-2 text-sm text-slate-600">表示名を変更できます。メールアドレス変更は認証処理が必要なため現在は固定です。</p>
          <div className="mt-5"><ProfileSettingsForm name={user.name ?? ""} email={user.email} /></div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">プラン</h2>
          <p className="mt-2 text-sm text-slate-600">Freeと買い切りPremiumの利用状態を確認・変更します。</p>
          <div className="mt-5"><PlanSettingsForm plan={user.plan} stripeTestMode={env.stripeTestMode} /></div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">パスワード</h2>
          <p className="mt-2 text-sm text-slate-600">現在のパスワードを確認してから、新しいパスワードへ変更します。</p>
          <div className="mt-5"><PasswordSettingsForm /></div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">予算・通知</h2>
          <p className="mt-2 text-sm text-slate-600">月額予算と新規登録時の標準通知設定を管理します。</p>
          <div className="mt-5"><BudgetSettingsForm monthlyBudget={preference?.monthlyBudget} defaultNotifyDaysBefore={preference?.defaultNotifyDaysBefore ?? DEFAULT_NOTIFY_DAYS_BEFORE} notificationHour={preference?.notificationHour ?? DEFAULT_NOTIFICATION_HOUR} /></div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">アカウント状態</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Info label="メール" value={user.email} />
            <Info label="メール認証" value={user.emailVerified ? "認証済み" : "未認証"} />
            <Info label="現在のプラン" value={planLabel(user.plan)} />
            <Info label="登録日" value={isoDate(user.createdAt)} />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
export async function MonthlyReportView() {
  const user = await requireVerifiedUser();
  if (!isPremiumPlan(user.plan)) {
    return <AppShell><PageHeader title="月次レポート" description="今月の支払い予定、前月比、削減候補、期限リスクを確認します。" /><PremiumOnlyNotice title="月次レポートはPremium限定です" description="毎月の固定費レビュー、削減候補、期限リスクの集約はPremiumで利用できます。" /></AppShell>;
  }

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
  const previousStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const previousEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);

  const subscriptions = (await prisma.subscription.findMany({
    where: { userId: user.id, deletedAt: null, status: "ACTIVE" },
    include: { category: true, paymentMethod: true },
    orderBy: { nextBillingDate: "asc" },
  })) as unknown as SubscriptionView[];
  const histories = (await prisma.paymentHistory.findMany({
    where: { userId: user.id, paidAt: { gte: previousStart, lte: monthEnd } },
    include: { subscription: { include: { category: true, paymentMethod: true } } },
    orderBy: { paidAt: "desc" },
  })) as unknown as PaymentHistoryView[];

  const monthHistories = histories.filter((item) => item.paidAt >= monthStart && item.paidAt <= monthEnd);
  const previousHistories = histories.filter((item) => item.paidAt >= previousStart && item.paidAt <= previousEnd);
  const currentPaid = monthHistories.reduce((sum, item) => sum + item.amount, 0);
  const previousPaid = previousHistories.reduce((sum, item) => sum + item.amount, 0);
  const delta = currentPaid - previousPaid;
  const deltaClass = delta > 0 ? "text-red-600" : delta < 0 ? "text-emerald-600" : "text-slate-950";
  const activeMonthly = subscriptions.reduce((sum, item) => sum + monthly(item.price, item.billingCycle, item.customCycleDays), 0);
  const dueThisMonth = subscriptions.filter((item) => item.nextBillingDate >= monthStart && item.nextBillingDate <= monthEnd);
  const riskItems = subscriptions.filter((item) =>
    (item.trialEndsAt && item.trialEndsAt >= today && item.trialEndsAt <= monthEnd) ||
    (item.cancellationDeadline && item.cancellationDeadline >= today && item.cancellationDeadline <= monthEnd),
  );
  const categoryCounts = subscriptions.reduce<Record<string, number>>((acc, item) => {
    const key = item.categoryId ?? "none";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const scored = subscriptions
    .map((item) => ({ item, score: reviewScore(item, categoryCounts[item.categoryId ?? "none"] ?? 1), saving: estimatedMonthlySaving(item) }))
    .sort((a, b) => b.score.score - a.score.score || b.saving - a.saving);
  const saving = scored.reduce((sum, item) => sum + item.saving, 0);

  return (
    <AppShell>
      <PageHeader title="月次レポート" description="今月見るべき支払い、更新、削減候補を1画面にまとめます。" action={<Link href="/review" className="btn-primary">見直しへ</Link>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card><p className="text-sm font-semibold text-slate-500">今月の支払い実績</p><p className="mt-2 text-3xl font-black">{yen.format(currentPaid)}</p><p className="mt-2 text-sm text-slate-500">記録済み {monthHistories.length}件</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">前月比</p><p className={"mt-2 text-3xl font-black " + deltaClass}>{delta >= 0 ? "+" : ""}{yen.format(delta)}</p><p className="mt-2 text-sm text-slate-500">前月 {yen.format(previousPaid)}</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">月額見込み</p><p className="mt-2 text-3xl font-black">{yen.format(activeMonthly)}</p><p className="mt-2 text-sm text-slate-500">アクティブ契約</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">今月の更新</p><p className="mt-2 text-3xl font-black">{dueThisMonth.length}件</p><p className="mt-2 text-sm text-slate-500">期限リスク {riskItems.length}件</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">削減余地</p><p className="mt-2 text-3xl font-black">{yen.format(saving)}</p><p className="mt-2 text-sm text-slate-500">年間 {yen.format(saving * MONTHS_PER_YEAR)}</p></Card>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <h2 className="text-lg font-bold">今月の支払い予定</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {dueThisMonth.length === 0 ? <EmptyState text="今月更新予定の契約はありません。" /> : dueThisMonth.map((item) => (
              <Link key={item.id} href={"/subscriptions/" + item.id} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-sm text-slate-500">{item.category?.name ?? "未分類"} / {dateText(item.nextBillingDate)}</p>
                </div>
                <p className="font-black">{yen.format(monthly(item.price, item.billingCycle, item.customCycleDays))}</p>
              </Link>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">期限リスク</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {riskItems.length === 0 ? <EmptyState text="今月中に対応が必要な期限はありません。" /> : riskItems.map((item) => (
              <Link key={item.id} href={"/subscriptions/" + item.id} className="block py-3">
                <p className="font-semibold">{item.name}</p>
                <p className="mt-1 text-sm text-slate-500">トライアル {dateText(item.trialEndsAt)} / 解約期限 {dateText(item.cancellationDeadline)}</p>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="text-lg font-bold">今月の見直し優先リスト</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {scored.slice(0, 6).map(({ item, score, saving }) => (
            <Link key={item.id} href={"/subscriptions/" + item.id} className="rounded-lg border border-slate-100 bg-white/70 p-4 shadow-sm transition hover:border-blue-200 hover:bg-blue-50">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{item.name}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{score.reasons.join(" / ")}</p>
                </div>
                <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">{score.score}</span>
              </div>
              <p className="mt-3 text-sm font-bold text-slate-700">削減見込み {yen.format(saving)}/月</p>
            </Link>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}
