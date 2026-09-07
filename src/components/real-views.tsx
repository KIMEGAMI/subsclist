import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell, Card, PageHeader } from "@/components/app-shell";
import { DashboardAnnouncements } from "@/components/dashboard-announcements";
import { NotificationSendButton } from "@/components/notification-send-button";
import { NotificationSnoozeControl } from "@/components/notification-snooze-control";
import { PrintPageButton } from "@/components/print-page-button";
import { ScheduledPriceForm } from "@/components/scheduled-price-form";
import { LogoutAllSessionsButton } from "@/components/logout-all-sessions-button";
import { AccountDeleteForm, BudgetSettingsForm, CancellationChecklist, CancellationEvidenceForm, CancellationPlanForm, CategoryForm, CsvCandidateDetectorForm, CsvDownloadButton, CsvImportForm, DailyUsageCheckButtons, DeleteCancellationEvidenceButton, DeletePaymentHistoryButton, EmailSettingsForm, LogoutButton, MonthlyCloseButton, PasswordSettingsForm, PaymentHistoryEditForm, PaymentHistoryForm, PaymentMethodForm, PlanSettingsForm, ProfileSettingsForm, RenewalDecisionForm, StatementMerchantAliasesForm, SubscriptionActions, SubscriptionForm, type StatementPaymentImportItem } from "@/components/real-forms";
import { requireVerifiedUser } from "@/lib/auth";
import {
  ALLOWED_URL_PROTOCOLS,
  DASHBOARD_ANNOUNCEMENT_MAX_ITEMS,
  DEFAULT_NOTIFICATION_HOUR,
  DEFAULT_NOTIFY_DAYS_BEFORE,
  LOGIN_SECURITY_EVENT_DISPLAY_LIMIT,
  PLACEHOLDER_HOSTS,
  MONTHLY_CLOSE_HISTORY_LIMIT,
  PREMIUM_MONTHLY_PRICE_YEN,
  STATEMENT_PAYMENT_IMPORT_HISTORY_LIMIT,
  RENEWAL_DECISION_HISTORY_LIMIT,
  RENEWAL_DECISION_WINDOW_DAYS,
  REVIEW_CAUTION_SCORE_THRESHOLD,
  REVIEW_STALE_DAYS,
  REVIEW_URGENT_SCORE_THRESHOLD,
  STRIPE_TRIAL_PERIOD_DAYS,
  UPCOMING_DEADLINE_DAYS,
} from "@/lib/app-constants";
import { annualAmount, AVERAGE_DAYS_PER_MONTH, daysUntil, isoDate, MONTHS_PER_YEAR, monthlyAmount as monthly, nextBillingOccurrence } from "@/lib/billing";
import {
  BILLING_RECONCILIATION_MATCH_WINDOW_DAYS,
  reconcileBillingPeriod,
  type BillingReconciliationStatus,
} from "@/lib/billing-reconciliation";
import { prisma } from "@/lib/prisma";
import { env, isProtectedAccountEmail } from "@/lib/env";
import { FREE_SUBSCRIPTION_LIMIT, hiddenByPlan, isPremiumPlan, limitByPlan } from "@/lib/plans";
import { getPublishedAnnouncements } from "@/lib/admin";
import { buildForecastSeries } from "@/lib/premium-insights";
import { estimatedMonthlySaving, reviewScore } from "@/lib/subscription-insights";
import { businessUseAmount, businessUseLabel } from "@/lib/subscription-business";
import { monthlyClosePeriod, summarizeMonthlyClose } from "@/lib/monthly-close";
import { calculateMonthlyCloseReadiness } from "@/lib/monthly-close-readiness";
import {
  previousMonthlyOutcomePeriod,
  summarizePreviousMonthlyOutcome,
} from "@/lib/monthly-digest";
import { resolveMonthlyReportPeriod, shiftMonthlyReportKey, type MonthlyReportPeriod } from "@/lib/monthly-report-period";
import { calculateOperationScore } from "@/lib/operation-score";
import { isRenewalDecisionDue, renewalDecisionPeriod, renewalDecisionStatus, renewalDecisionStatusLabel } from "@/lib/renewal-decision";
import { calculateCostPerUsage } from "@/lib/subscription-cost";
import { calculateSubscriptionHealth } from "@/lib/subscription-health";
import { detectUnusedSubscriptions } from "@/lib/subscription-unused";
import { detectCategoryDuplicates } from "@/lib/subscription-duplicates";
import { detectCancellationCandidates } from "@/lib/subscription-cancellation-candidates";
import { buildUsagePeriods, countUsageByPeriod, countUsageInRecentDays, japanCalendarDate, shiftCalendarDays, type UsagePeriodKey } from "@/lib/subscription-usage";
import { subscriptionOnboardingSummary, type SubscriptionOnboardingInput } from "@/lib/subscription-onboarding";
import { needsWeeklyReview, startOfJapanWeek } from "@/lib/subscription-weekly-review";
import {
  buildCompletedSavingsTimeline,
  summarizeCompletedSavings,
} from "@/lib/subscription-savings";
import { stripePlanTrialDisplay } from "@/lib/stripe-trial";
import { stripeSubscriptionCanBeManaged } from "@/lib/stripe-entitlement";
import { stripeCancellationScheduled } from "@/lib/stripe-subscription-period";
import { UNUSED_USAGE_WINDOWS } from "@/lib/subscription-unused";
import { syncStripeCheckoutSessionById } from "@/lib/stripe-billing";
import { stripe } from "@/lib/stripe";
import { isSubscriptionNotificationSnoozed } from "@/lib/notification-snooze";
import { paymentMethodTypeLabel, stripePaymentMethodTypes } from "@/lib/stripe-payment-methods";
import { paymentOrganizationMissing, summarizePaymentOrganization } from "@/lib/payment-organization";
import { ACTION_INBOX_DISPLAY_LIMIT, buildActionInbox, type ActionInboxTask } from "@/lib/action-inbox";
import {
  filterAndSortSubscriptions,
  hasSubscriptionListFilters,
  SUBSCRIPTION_LIST_QUERY_MAX_LENGTH,
  type SubscriptionListFilters,
} from "@/lib/subscription-list";
import { SubscriptionSimulator } from "@/components/subscription-simulator";
import { GeminiAnalysisPanel } from "@/components/gemini-analysis-panel";
import { SubscriptionBulkEditor } from "@/components/subscription-bulk-editor";
import { PaymentHistoryBulkOrganizer, type PaymentHistoryBulkGroup } from "@/components/payment-history-bulk-organizer";
import { effectiveSubscriptionNotification } from "@/lib/subscription-notification";
import { billingProviderGuide, billingProviderLabel } from "@/lib/subscription-billing-provider";
import { buildPaymentYearComparison, resolvePaymentTrendYear, type PaymentTrendDriver } from "@/lib/payment-year-comparison";
import { buildReviewOutcomePipeline, type ReviewOutcomeStage } from "@/lib/review-outcome-pipeline";
import { buildAnnualBusinessReport } from "@/lib/annual-business-report";
import { matchesPaymentHistoryFilter, PAYMENT_HISTORY_DISPLAY_LIMIT, paymentHistoryFilterLabel, resolvePaymentHistoryFilter } from "@/lib/payment-history-filter";
import {
  formatExchangeRateScaled,
  formatSourceAmountMinor,
  isSubscriptionCurrency,
} from "@/lib/subscription-currency";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const MIN_VISIBLE_SAVINGS_BAR_PERCENT = 8;

type CancellationStatusValue = "NONE" | "CONSIDERING" | "PLANNED" | "REQUESTED" | "COMPLETED";

type CategoryView = { id: string; name: string; color: string };

type PaymentMethodView = { id: string; name: string; type: string; memo: string | null };

type AnnouncementView = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: Date;
};

type PaymentHistoryView = {
  id: string;
  subscriptionId: string;
  amount: number;
  paidAt: Date;
  businessUsePercent: number;
  subscriptionNameSnapshot: string;
  categoryNameSnapshot: string | null;
  paymentMethodNameSnapshot: string | null;
  accountingLabel: string | null;
  referenceNumber: string | null;
  referenceUrl: string | null;
  memo: string | null;
  subscription: { id: string; name: string };
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
type StripeInvoiceView = {
  id: string;
  amountPaid: number;
  amountDue: number;
  currency: string;
  status: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  createdAt: Date;
};

type SubscriptionUsageView = { subscriptionId: string; usedDate: Date };
type WeeklyUsageReviewView = { subscriptionId: string; weekStart: Date };

type SavingChallengeView = {
  id: string;
  subscriptionId: string;
  year: number;
  month: number;
  status: string;
  potentialMonthlySaving: number;
  reason: string | null;
  renewalDate: Date;
  decidedAt: Date;
};

type StripeInvoicesResult = {
  invoices: StripeInvoiceView[];
  message: string | null;
  messageTone: "neutral" | "warning";
};

async function getStripeInvoicesForSettings(customerId: string | null): Promise<StripeInvoicesResult> {
  if (!customerId) return { invoices: [], message: "請求書はまだ発行されていません。Premium契約後にここから確認できます。", messageTone: "neutral" };

  try {
    const invoices = await stripe().invoices.list({ customer: customerId, limit: 5 });
    return {
      invoices: invoices.data.map((invoice) => ({
        id: invoice.id,
        amountPaid: invoice.amount_paid,
        amountDue: invoice.amount_due,
        currency: invoice.currency,
        status: invoice.status,
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
        invoicePdf: invoice.invoice_pdf ?? null,
        createdAt: new Date(invoice.created * 1000),
      })),
      message: null,
      messageTone: "neutral",
    };
  } catch {
    console.error("Stripe invoices fetch failed.");
    return { invoices: [], message: "Stripe請求書を取得できませんでした。時間をおいて再読み込みするか、Stripe設定を確認してください。", messageTone: "warning" };
  }
}

function StripeInvoicesCard({ result }: { result: StripeInvoicesResult }) {
  return (
    <Card>
      <h2 className="text-lg font-bold">請求書</h2>
      <p className="mt-2 text-sm text-slate-600">Stripeで発行された直近5件の請求書を確認できます。</p>
      {result.message ? (
        <p className={result.messageTone === "warning" ? "mt-5 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-800" : "mt-5 rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-600"}>{result.message}</p>
      ) : result.invoices.length === 0 ? (
        <div className="mt-5"><EmptyState text="表示できる請求書はまだありません。" /></div>
      ) : (
        <div className="mt-5 divide-y divide-slate-100 rounded-lg border border-slate-100 bg-white/70 px-4">
          {result.invoices.map((invoice) => {
            const amount = invoice.amountPaid > 0 ? invoice.amountPaid : invoice.amountDue;
            return (
              <div key={invoice.id} className="grid gap-3 py-4 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <p className="font-bold text-slate-950">{dateText(invoice.createdAt)} / {invoice.status ?? "unknown"}</p>
                  <p className="mt-1 text-sm text-slate-500">{invoice.currency.toUpperCase()} {amount.toLocaleString("ja-JP")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {invoice.hostedInvoiceUrl && <Link href={invoice.hostedInvoiceUrl} className="btn-secondary min-h-0 px-3 py-2 text-sm" target="_blank" rel="noreferrer">表示</Link>}
                  {invoice.invoicePdf && <Link href={invoice.invoicePdf} className="btn-secondary min-h-0 px-3 py-2 text-sm" target="_blank" rel="noreferrer">PDF</Link>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

type SubscriptionView = {
  id: string;
  name: string;
  price: number;
  scheduledPrice: number | null;
  scheduledPriceAt: Date | null;
  currency: string;
  sourceAmountMinor: number | null;
  exchangeRateToJpyScaled: number | null;
  exchangeRateUpdatedAt: Date | null;
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
  notificationSnoozedUntil: Date | null;
  businessUsePercent: number;
  defaultAccountingLabel: string | null;
  usageFrequency: string;
  priority: string;
  logoUrl: string | null;
  categoryId: string | null;
  paymentMethodId: string | null;
  billingProvider: string;
  cancellationStatus: CancellationStatusValue;
  plannedCancelAt: Date | null;
  cancellationMemo: string | null;
  cancellationCompletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  category?: CategoryView | null;
  paymentMethod?: PaymentMethodView | null;
  paymentHistories: PaymentHistoryView[];
  statementMerchantAliases?: Array<{ id: string; merchantLabel: string }>;
  notificationSettings?: Array<{ enabled: boolean; daysBefore: number }>;
  notificationsEnabled?: boolean;
};

const usagePeriodLabels: Array<{ key: UsagePeriodKey; label: string }> = [
  { key: "today", label: "今日" },
  { key: "week", label: "今週" },
  { key: "month", label: "今月" },
  { key: "days30", label: "過去30日" },
  { key: "days90", label: "過去90日" },
  { key: "days365", label: "過去365日" },
];

function usageDatesBySubscription(records: SubscriptionUsageView[]): Map<string, Date[]> {
  return records.reduce<Map<string, Date[]>>((datesBySubscription, record) => {
    const dates = datesBySubscription.get(record.subscriptionId) ?? [];
    dates.push(record.usedDate);
    datesBySubscription.set(record.subscriptionId, dates);
    return datesBySubscription;
  }, new Map<string, Date[]>());
}

function UsageSummary({
  usedDates,
  price,
  billingCycle,
  customCycleDays,
}: {
  usedDates: Date[];
  price: number;
  billingCycle: string;
  customCycleDays: number | null;
}) {
  const counts = countUsageByPeriod(usedDates);
  const cost = calculateCostPerUsage(price, billingCycle, customCycleDays, counts.month);
  return (
    <Card className="mt-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">利用実績</h2>
          <p className="mt-1 text-sm text-slate-600">利用した日を記録しています。1日あたりの記録は1件です。</p>
        </div>
        <p className="text-sm font-black text-blue-700">今月 {counts.month}日</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {usagePeriodLabels.map((period) => (
          <div key={period.key} className="rounded-lg border border-slate-100 bg-white/75 p-3 shadow-sm">
            <p className="text-sm font-bold text-slate-500">{period.label}</p>
            <p className="mt-1 text-2xl font-black text-slate-950">{counts[period.key]}<span className="ml-1 text-sm">日</span></p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/80 p-4">
        <p className="text-sm font-black text-blue-900">今月の費用対効果</p>
        {cost.costPerUsage === null ? (
          <p className="mt-1 text-sm font-semibold leading-6 text-blue-800">今月まだ利用されていないため、1利用日あたりの費用は算出できません。</p>
        ) : (
          <p className="mt-1 text-sm font-semibold leading-6 text-blue-800">月額換算 {yen.format(cost.monthlyCost)} / 今月 {cost.usageDays}日利用 / 1利用日あたり 約 {yen.format(Math.round(cost.costPerUsage))}</p>
        )}
      </div>
    </Card>
  );
}

type PriceHistoryView = { id: string; price: number; billingCycle: string; customCycleDays: number | null; effectiveFrom: Date };

function PriceHistoryCard({
  histories,
  currentPrice,
  currentBillingCycle,
  currentCustomCycleDays,
}: {
  histories: PriceHistoryView[];
  currentPrice: number;
  currentBillingCycle: string;
  currentCustomCycleDays: number | null;
}) {
  if (histories.length === 0) return null;
  return (
    <Card className="mt-5">
      <h2 className="text-lg font-bold">料金変更履歴</h2>
      <p className="mt-1 text-sm text-slate-600">料金または請求周期を変更したとき、変更前の条件を記録します。</p>
      <div className="mt-4 divide-y divide-slate-100">
        {histories.map((history, index) => {
          const nextHistory = histories[index + 1];
          const nextPrice = nextHistory?.price ?? currentPrice;
          const nextBillingCycle = nextHistory?.billingCycle ?? currentBillingCycle;
          const nextCustomCycleDays = nextHistory?.customCycleDays ?? currentCustomCycleDays;
          const beforeMonthly = monthly(history.price, history.billingCycle, history.customCycleDays);
          const afterMonthly = monthly(nextPrice, nextBillingCycle, nextCustomCycleDays);
          const difference = afterMonthly - beforeMonthly;
          return <div key={history.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">{isoDate(history.effectiveFrom)}</p><p className="mt-1 text-sm text-slate-600">{yen.format(beforeMonthly)} / 月 → {yen.format(afterMonthly)} / 月</p></div><p className={`text-sm font-black ${difference > 0 ? "text-rose-700" : difference < 0 ? "text-emerald-700" : "text-slate-600"}`}>{difference > 0 ? `+${yen.format(difference)}` : difference < 0 ? `-${yen.format(Math.abs(difference))}` : "変更なし"}</p></div>;
        })}
      </div>
    </Card>
  );
}

function HealthScoreCard({ result }: { result: ReturnType<typeof calculateSubscriptionHealth> }) {
  return (
    <Card className="mb-5 border-emerald-100 bg-emerald-50/70">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black text-emerald-800">サブスク健康度</p>
          <p className="mt-1 text-4xl font-black text-slate-950">{result.score}<span className="text-lg"> / 100</span></p>
          <p className="mt-1 text-sm font-bold text-emerald-800">{result.label}</p>
        </div>
        <div className="max-w-xl space-y-1 text-sm font-semibold leading-6 text-slate-700">
          {result.reasons.length === 0 ? <p>現在の登録状況に大きな見直し要因は見つかっていません。</p> : result.reasons.map((reason) => <p key={reason}>{reason}</p>)}
        </div>
      </div>
    </Card>
  );
}

function UnusedSubscriptionsCard({ items }: { items: ReturnType<typeof detectUnusedSubscriptions> }) {
  return (
    <Card className="mb-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">未使用の可能性</h2>
          <p className="mt-1 text-sm text-slate-600">登録後に十分な期間があり、利用記録がない契約だけを表示します。</p>
        </div>
        <Link href="/review" className="text-sm font-semibold text-blue-700">見直しへ</Link>
      </div>
      <div className="mt-4 divide-y divide-slate-100">
        {items.length === 0 ? <EmptyState text="現在、未使用と判断できる契約はありません。" /> : items.slice(0, 5).map((item) => (
          <Link key={item.id} href={`/subscriptions/${item.id}`} className="flex items-center justify-between gap-3 py-3">
            <span className="font-bold text-slate-950">{item.name}</span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">{item.unusedDays}日未使用</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function CategoryDuplicatesCard({ groups }: { groups: ReturnType<typeof detectCategoryDuplicates> }) {
  return (
    <Card className="mb-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">カテゴリ重複の可能性</h2>
          <p className="mt-1 text-sm text-slate-600">同じカテゴリ内の複数契約を、利用日数が少ない順に確認できます。</p>
        </div>
        <Link href="/review" className="text-sm font-semibold text-blue-700">見直しへ</Link>
      </div>
      <div className="mt-4 space-y-3">
        {groups.length === 0 ? <EmptyState text="カテゴリ重複の可能性はありません。" /> : groups.map((group) => (
          <div key={group.categoryName} className="rounded-lg border border-slate-100 bg-white/75 p-4">
            <div className="flex items-center justify-between gap-3"><p className="font-black">{group.categoryName}</p><p className="font-black text-slate-950">月額 {yen.format(group.monthlyCost)}</p></div>
            <div className="mt-3 space-y-2">
              {group.subscriptions.map((subscription) => <Link key={subscription.id} href={`/subscriptions/${subscription.id}`} className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-slate-700">{subscription.name}</span><span className="text-slate-500">{subscription.usageDays30 === null ? "利用記録なし" : `30日 ${subscription.usageDays30}日`}</span></Link>)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

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
          <p className="mt-1 text-sm font-semibold text-amber-800">現在 {hiddenCount}件 が非表示です。Premiumに変更すると全件表示、CSV、高度分析、解約支援が使えます。初回のみ{STRIPE_TRIAL_PERIOD_DAYS}日間お試し無料です。</p>
        </div>
        <Link href="/billing" className="btn-primary shrink-0">Premiumに変更</Link>
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
          <div className="rounded-lg bg-white/80 p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">確度補正後の年間試算</p><p className="mt-1 text-2xl font-black text-emerald-700">{yen.format(yearlySaving)}</p></div>
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
  monthlyCloseCompleted,
}: {
  score: number;
  dataQuality: number;
  urgentCount: number;
  reviewCount: number;
  lowUsageCount: number;
  budgetRate: number;
  budgetExceeded: boolean;
  monthlyCloseCompleted: boolean;
}) {
  const scoreTone = score >= 80 ? "text-emerald-700" : score >= 60 ? "text-amber-700" : "text-rose-700";
  const actions = [
    !monthlyCloseCompleted ? "今月の月次締めが未完了です。月次レポートで確認を完了してください。" : null,
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

function PremiumForecastCard({
  series,
  forecastTotal,
  peakMonth,
  cancellationCoverage,
  missingCancellationCount,
  duplicateCategoryCount,
  duplicateCategoryGroups,
}: {
  series: ReturnType<typeof buildForecastSeries>;
  forecastTotal: number;
  peakMonth: { label: string; total: number };
  cancellationCoverage: number;
  missingCancellationCount: number;
  duplicateCategoryCount: number;
  duplicateCategoryGroups: number;
}) {
  const max = Math.max(...series.map((item) => item.total), 0);

  return (
    <Card className="mt-6 border-blue-100 bg-gradient-to-br from-blue-50/95 to-cyan-50/90">
      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div>
          <p className="text-xs font-black uppercase text-blue-700">Premium Forecast</p>
          <h2 className="mt-2 text-xl font-black text-blue-950">12ヶ月先の支出と解約導線を見通す</h2>
          <p className="mt-2 text-sm leading-6 text-blue-900">
            今後1年の支払い予測、解約ページの有無、カテゴリ重複をまとめて確認できます。更新前に動くべき契約が見えます。
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MiniMetric label="12ヶ月予測" value={yen.format(forecastTotal)} />
            <MiniMetric label="ピーク月" value={`${peakMonth.label} ${yen.format(peakMonth.total)}`} />
            <MiniMetric label="解約導線あり率" value={`${cancellationCoverage}%`} />
            <MiniMetric label="カテゴリ重複" value={`${duplicateCategoryCount}件`} />
          </div>
          <div className="mt-4 rounded-lg border border-white/70 bg-white/75 p-4">
            <p className="text-sm font-bold text-slate-700">要対応メモ</p>
            <div className="mt-3 grid gap-2 text-sm font-semibold text-slate-700">
              <p>解約ページ未設定: {missingCancellationCount}件</p>
              <p>同カテゴリ重複: {duplicateCategoryGroups}グループ</p>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {series.map((bucket) => {
            const width = max ? Math.max(6, Math.round((bucket.total / max) * 100)) : 0;
            return (
              <div key={bucket.key} className="rounded-lg border border-white/70 bg-white/75 p-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-slate-700">{bucket.label}</p>
                  <p className="text-sm font-black text-slate-950">{yen.format(bucket.total)}</p>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500" style={{ width: `${width}%` }} />
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-500">{bucket.payments}件</p>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function SetupChecklistCard(input: SubscriptionOnboardingInput) {
  const { steps, doneCount, progressPercent, nextStep } = subscriptionOnboardingSummary(input);

  if (!nextStep) return null;

  return (
    <Card className="mb-5 border-emerald-200 bg-emerald-50/90">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(28rem,1.15fr)] xl:items-start">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black text-emerald-800">運用開始までの到達度</p>
            <p className="text-sm font-black text-emerald-950">{progressPercent}%</p>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-100" aria-label={`初期設定 ${progressPercent}%完了`}>
            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${progressPercent}%` }} />
          </div>
          <h2 className="mt-4 text-xl font-black text-emerald-950">次は「{nextStep.label}」</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-emerald-900">{nextStep.description}</p>
          <Link href={nextStep.href} className="btn-primary mt-4 inline-flex">{nextStep.action}</Link>
          <p className="mt-3 text-xs font-bold text-emerald-800">{doneCount}/{steps.length}項目完了。台帳作成から実績確認までを順番に進めます。</p>
        </div>
        <div className="divide-y divide-emerald-100 border-y border-emerald-100">
          {steps.map((step) => (
            <Link key={step.key} href={step.href} className="grid min-h-12 grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-3 px-2 py-2 text-sm transition hover:bg-white/60">
              <span className="text-xs font-black text-emerald-700">{step.stage}</span>
              <span className={`font-bold ${step.done ? "text-slate-500" : "text-slate-900"}`}>
                <span className={`mr-2 inline-grid size-5 place-items-center rounded-full text-[11px] font-black ${step.done ? "bg-emerald-600 text-white" : "bg-white text-slate-500"}`}>{step.done ? "済" : "未"}</span>
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
      <p className="mt-2 text-sm font-black text-blue-700">初回のみ{STRIPE_TRIAL_PERIOD_DAYS}日間お試し無料。無料期間中に解約すれば料金はかかりません。</p>
      <Link href="/billing" className="btn-primary mt-5 inline-flex">Premiumに変更</Link>
    </Card>
  );
}

function dateText(value?: Date | null) {
  return value ? isoDate(value) : "未設定";
}

function reconciliationStatusLabel(status: BillingReconciliationStatus) {
  if (status === "PAID_AS_EXPECTED") return "予定どおり";
  if (status === "AMOUNT_MISMATCH") return "金額差異";
  if (status === "UNCONFIRMED") return "支払い未確認";
  return "今後の予定";
}

function reconciliationStatusClass(status: BillingReconciliationStatus) {
  if (status === "PAID_AS_EXPECTED") return "bg-emerald-100 text-emerald-800";
  if (status === "AMOUNT_MISMATCH") return "bg-amber-100 text-amber-900";
  if (status === "UNCONFIRMED") return "bg-red-100 text-red-800";
  return "bg-blue-100 text-blue-800";
}

const trialEndDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Tokyo",
});

function StripeTrialStatusCard({
  stripeSubscriptionStatus,
  plan,
  stripeTrialEndAt,
  trialUsedAt,
}: {
  plan: string;
  stripeSubscriptionStatus: string | null;
  stripeTrialEndAt: Date | null;
  trialUsedAt: Date | null;
}) {
  const display = stripePlanTrialDisplay(plan, stripeSubscriptionStatus, stripeTrialEndAt, trialUsedAt);

  if (display === "ACTIVE_TRIAL" && stripeTrialEndAt) {
    return (
      <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
        <p className="font-black">Premium無料トライアル中</p>
        <p>無料トライアルは {trialEndDateFormatter.format(stripeTrialEndAt)} に終了します。</p>
        <p>無料期間中に解約すると料金はかかりません。継続した場合は月額{yen.format(PREMIUM_MONTHLY_PRICE_YEN)}で更新されます。</p>
      </div>
    );
  }

  if (display === "PAYMENT_PAST_DUE") {
    return (
      <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <p className="font-black">お支払いの再確認が必要です</p>
        <p>Stripeで請求の支払いが完了していません。Premium機能は現在利用できますが、支払い失敗が続くと停止する場合があります。</p>
        <p>下の「契約管理・解約（Stripe）を開く」から支払い方法を確認してください。</p>
      </div>
    );
  }

  if (display === "PAYMENT_UNPAID") {
    return (
      <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm leading-6 text-red-950">
        <p className="font-black">Premiumのお支払いが未完了です</p>
        <p>Premium機能は停止されています。Stripeの契約管理で支払い方法を更新し、課金状態を再確認してください。</p>
      </div>
    );
  }

  if (display === "PAYMENT_INCOMPLETE") {
    return (
      <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <p className="font-black">Premiumの決済が完了していません</p>
        <p>Stripeの契約管理で支払いを完了するか、支払い方法を確認してください。重複契約を防ぐため、新しい申込みは表示していません。</p>
      </div>
    );
  }

  if (display === "SUBSCRIPTION_PAUSED") {
    return (
      <div className="mt-4 rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-800">
        <p className="font-black">Premium契約は一時停止中です</p>
        <p>Stripeの契約管理で契約状態を確認してください。再開後に課金状態を再確認するとSubscListへ反映されます。</p>
      </div>
    );
  }

  if (display === "SUBSCRIPTION_ENDED") {
    return (
      <div className="mt-4 rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-800">
        <p className="font-black">Premium契約は終了しています</p>
        <p>現在はFreeプランです。再び利用する場合は、下のPremium申込みから新しい契約を開始できます。</p>
      </div>
    );
  }

  if (display === "PREMIUM_ACTIVE") {
    return (
      <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
        <p className="font-black">Premium契約が有効です</p>
        <p>Premium機能を利用できます。支払い方法の変更、次回請求日の確認、解約はStripeの契約管理から行えます。</p>
      </div>
    );
  }

  if (display === "TRIAL_AVAILABLE") {
    return (
      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        <p className="font-black">初回のみ{STRIPE_TRIAL_PERIOD_DAYS}日間無料</p>
        <p>本日の請求は0円です。無料期間中に解約すると料金はかかりません。無料期間終了後は月額{yen.format(PREMIUM_MONTHLY_PRICE_YEN)}で自動更新されます。</p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
      <p className="font-black">無料トライアルは利用済みです</p>
      <p>再加入時は無料期間なしで、通常の月額{yen.format(PREMIUM_MONTHLY_PRICE_YEN)}のPremium契約になります。</p>
    </div>
  );
}
const contractDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Tokyo",
});

function StripeContractPeriodCard({
  plan,
  currentPeriodEnd,
  cancelAt,
  cancelAtPeriodEnd,
}: {
  plan: string;
  currentPeriodEnd: Date | null;
  cancelAt: Date | null;
  cancelAtPeriodEnd: boolean;
}) {
  if (!isPremiumPlan(plan)) return null;

  if (cancelAt && stripeCancellationScheduled(cancelAt)) {
    return (
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <p className="font-black">解約予約済み</p>
        <p>Premiumは {contractDateFormatter.format(cancelAt)} まで利用できます。以降は自動更新されません。</p>
        {cancelAtPeriodEnd && <p>現在の契約期間が終了した時点でFreeプランへ切り替わります。</p>}
      </div>
    );
  }

  if (!currentPeriodEnd) return null;

  return (
    <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
      <p className="font-black">次回契約更新日</p>
      <p>{contractDateFormatter.format(currentPeriodEnd)}</p>
      <p className="text-blue-800">実際の請求日時や支払い方法は、Stripeの契約管理で確認できます。</p>
    </div>
  );
}


function notificationTypeLabel(type: string) {
  if (type === "renewal") return "更新日のお知らせ";
  if (type === "trial") return "無料トライアル終了";
  if (type === "cancellation") return "解約期限";
  if (type === "weekly_review") return "今週の利用確認";
  if (type === "unused_30") return "30日間未使用";
  if (type === "unused_60") return "60日間未使用";
  if (type === "unused_90") return "90日間未使用";
  if (type === "price_increase") return "値上げ登録";
  if (type === "scheduled_price_change") return "価格変更予定";
  return "通知";
}

function notificationSentAt(value: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(value);
}

function loginSecurityEventLabel(type: string) {
  if (type === "NEW_DEVICE") return "新しい端末からログイン";
  if (type === "ACCOUNT_LOCKED") return "連続失敗のため一時ロック";
  if (type === "ALL_SESSIONS_REVOKED") return "すべての端末をログアウト";
  return "ログイン成功";
}

function userNotificationTypeLabel(type: string) {
  if (type === "budget_overrun") return "月額予算の超過";
  if (type === "monthly_saving_challenge") return "月次削減チャレンジ";
  if (type === "monthly_portfolio_digest") return "月次運用サマリー";
  return "アカウント通知";
}

function userNotificationBadge(type: string) {
  if (type === "budget_overrun") return "予算";
  if (type === "monthly_portfolio_digest") return "月次集計";
  return "見直し";
}

function serviceIcon(item: { logoUrl?: string | null }) {
  return safeExternalUrl(item.logoUrl);
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

function isUpcomingWithin(value: Date, maximumDays: number) {
  const remainingDays = daysUntil(value);
  return remainingDays >= 0 && remainingDays <= maximumDays;
}

const defaultCancellationChecklist = [
  "解約条件と最低利用期間を確認する",
  "次回更新日と解約期限を確認する",
  "必要なデータや領収書を保存する",
  "解約ページまたは問い合わせ窓口で手続きする",
  "受付番号・完了メール・画面URLを証跡に残す",
  "次回請求が止まっているか確認する",
];


type DailyCheckItem = SubscriptionView & { dailyReason: string; dailyScore: number };

function dailyActionReason(item: SubscriptionView) {
  if (item.trialEndsAt && isUpcomingWithin(item.trialEndsAt, UPCOMING_DEADLINE_DAYS)) return "無料トライアル終了が近い";
  if (item.cancellationDeadline && isUpcomingWithin(item.cancellationDeadline, UPCOMING_DEADLINE_DAYS)) return "解約期限が近い";
  if (isUpcomingWithin(item.nextBillingDate, 1)) return "支払い予定が近い";
  if (item.usageFrequency === "UNKNOWN") return "利用状況が未設定";
  if (item.usageFrequency === "RARELY") return "最近使っていない候補";
  if (needsReview(item.lastReviewedAt)) return "見直し日を更新したい";
  return "今日の利用確認";
}

function dailyActionScore(item: SubscriptionView) {
  const due = daysUntil(item.nextBillingDate);
  const trialDue = item.trialEndsAt ? daysUntil(item.trialEndsAt) : Number.POSITIVE_INFINITY;
  const cancelDue = item.cancellationDeadline ? daysUntil(item.cancellationDeadline) : Number.POSITIVE_INFINITY;
  return (
    (due === 0 ? 50 : due === 1 ? 42 : due <= 7 ? 28 : 0) +
    (trialDue >= 0 && trialDue <= 7 ? 35 : 0) +
    (cancelDue >= 0 && cancelDue <= 7 ? 35 : 0) +
    (item.usageFrequency === "UNKNOWN" ? 22 : 0) +
    (item.usageFrequency === "RARELY" ? 26 : 0) +
    (needsReview(item.lastReviewedAt) ? 18 : 0) +
    Math.min(20, Math.round(monthly(item.price, item.billingCycle, item.customCycleDays) / 300))
  );
}

function DailyCommandCenter({
  todayDue,
  weekDue,
  checkItems,
  monthlyTotal,
  budget,
  usedTodayIds,
}: {
  todayDue: SubscriptionView[];
  weekDue: SubscriptionView[];
  checkItems: DailyCheckItem[];
  monthlyTotal: number;
  budget: number | null;
  usedTodayIds: Set<string>;
}) {
  const weekTotal = weekDue.reduce((sum, item) => sum + monthly(item.price, item.billingCycle, item.customCycleDays), 0);
  const budgetRemaining = budget === null ? null : budget - monthlyTotal;
  const primary = checkItems[0] ?? null;

  return (
    <Card className="mb-5 border-blue-200 bg-gradient-to-br from-white/95 to-blue-50/90">
      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div>
          <p className="text-xs font-black uppercase text-blue-700">今日の確認</p>
          <h2 className="mt-2 text-xl font-black text-slate-950">毎日見るべき固定費の動き</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MiniMetric label="今日までの支払い" value={`${todayDue.length}件`} />
            <MiniMetric label="7日以内の支払い" value={yen.format(weekTotal)} />
            <MiniMetric label="今月の残り予算" value={budgetRemaining === null ? "未設定" : yen.format(budgetRemaining)} />
          </div>
          <div className="mt-4 rounded-lg border border-white/80 bg-white/75 p-4">
            <p className="text-sm font-bold text-slate-700">今日の一手</p>
            {primary ? (
              <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <Link href={`/subscriptions/${primary.id}`} className="font-black text-slate-950 hover:text-blue-700">{primary.name}</Link>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{primary.dailyReason} / 次回更新 {dateText(primary.nextBillingDate)} / {yen.format(monthly(primary.price, primary.billingCycle, primary.customCycleDays))}/月</p>
                </div>
                <DailyUsageCheckButtons id={primary.id} compact usedToday={usedTodayIds.has(primary.id)} />
              </div>
            ) : (
              <EmptyState text="今日確認する契約はありません。サブスクを登録すると毎日の確認項目が表示されます。" />
            )}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">使った・使ってないチェック</h2>
            <Link href="/subscriptions" className="text-sm font-semibold text-blue-700">一覧へ</Link>
          </div>
          <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-white/80 bg-white/75 px-4">
            {checkItems.length === 0 ? (
              <div className="py-4"><EmptyState text="チェック対象はありません。" /></div>
            ) : (
              checkItems.slice(0, 3).map((item) => (
                <div key={item.id} className="grid gap-3 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <Link href={`/subscriptions/${item.id}`} className="font-bold text-slate-950 hover:text-blue-700">{item.name}</Link>
                    <p className="mt-1 text-sm text-slate-500">{item.dailyReason} / 利用頻度 {usageLabel(item.usageFrequency)}</p>
                  </div>
                  <DailyUsageCheckButtons id={item.id} compact usedToday={usedTodayIds.has(item.id)} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function TodaySubscListCard({
  dailyFixedCost,
  currentMonthPayment,
  nextPayment,
  unusedCount,
  candidateCount,
  annualSaving,
  healthScore,
  premium,
}: {
  dailyFixedCost: number;
  currentMonthPayment: number;
  nextPayment: SubscriptionView | null;
  unusedCount: number;
  candidateCount: number;
  annualSaving: number;
  healthScore: ReturnType<typeof calculateSubscriptionHealth>;
  premium: boolean;
}) {
  return (
    <Card className="mb-5 border-blue-200 bg-gradient-to-br from-white/95 via-cyan-50/90 to-blue-50/80">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-black uppercase text-blue-700">Today</p><h2 className="mt-1 text-xl font-black text-slate-950">今日のSubscList</h2></div>
        <p className="text-sm font-semibold text-slate-600">固定費と見直しの要点をまとめています。</p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniMetric label="今日の固定費（概算）" value={`約 ${yen.format(dailyFixedCost)}`} />
        <MiniMetric label="今月の支払い予定" value={yen.format(currentMonthPayment)} />
        <MiniMetric label="今月未使用" value={`${unusedCount}件`} />
        <MiniMetric label="解約候補" value={`${candidateCount}件`} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-white/80 bg-white/75 p-4"><p className="text-sm font-bold text-slate-500">次の支払い</p>{nextPayment ? <Link href={`/subscriptions/${nextPayment.id}`} className="mt-2 block"><p className="font-black text-slate-950">{nextPayment.name}</p><p className="mt-1 text-sm font-semibold text-slate-600">{isoDate(nextPayment.nextBillingDate)} / {yen.format(nextPayment.price)}</p></Link> : <p className="mt-2 text-sm font-semibold text-slate-500">予定はありません。</p>}</div>
        <div className="rounded-lg border border-white/80 bg-white/75 p-4"><p className="text-sm font-bold text-slate-500">確度補正後の年間試算</p><p className="mt-2 text-2xl font-black text-slate-950">{premium ? yen.format(annualSaving) : "Premium"}</p><Link href="/review" className="mt-2 inline-block text-sm font-bold text-blue-700">見直しレポートへ</Link></div>
        <div className="rounded-lg border border-white/80 bg-white/75 p-4"><p className="text-sm font-bold text-slate-500">健康スコア</p><p className="mt-2 text-2xl font-black text-slate-950">{healthScore.score}<span className="text-sm"> / 100</span></p><p className="mt-1 text-sm font-semibold text-slate-600">{healthScore.label}</p></div>
      </div>
    </Card>
  );
}

function ActionInboxCard({ tasks }: { tasks: ActionInboxTask[] }) {
  const urgentCount = tasks.filter((item) => item.priority === "URGENT").length;
  const importantCount = tasks.filter((item) => item.priority === "IMPORTANT").length;
  const visibleTasks = tasks.slice(0, ACTION_INBOX_DISPLAY_LIMIT);
  const hiddenCount = Math.max(0, tasks.length - visibleTasks.length);
  const priorityStyle = {
    URGENT: "bg-rose-100 text-rose-800",
    IMPORTANT: "bg-amber-100 text-amber-900",
    ROUTINE: "bg-slate-100 text-slate-700",
  } as const;
  const priorityLabel = { URGENT: "至急", IMPORTANT: "優先", ROUTINE: "定期" } as const;
  return (
    <Card className="mb-5 border-blue-200 bg-white/95">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black text-blue-700">ACTION INBOX</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">今週やること</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">期限・請求差異・未確認支払い・更新判断・証憑整理を優先順にまとめています。元の記録を処理すると自動で一覧から外れます。</p>
        </div>
        <div className="flex gap-2 text-sm font-black">
          <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">至急 {urgentCount}件</span>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">優先 {importantCount}件</span>
        </div>
      </div>
      <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-100 bg-white/75 px-4">
        {visibleTasks.length === 0 ? <div className="py-4"><EmptyState text="今週対応が必要な項目はありません。" /></div> : visibleTasks.map((item) => (
          <div key={item.id} className="grid gap-3 py-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
            <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-black ${priorityStyle[item.priority]}`}>{priorityLabel[item.priority]}</span>
            <div className="min-w-0">
              <p className="font-black text-slate-950">{item.title}</p>
              <p className="mt-1 text-sm font-medium leading-6 text-slate-600">{item.detail}</p>
            </div>
            <Link href={item.href} className="btn-secondary min-h-0 whitespace-nowrap px-3 py-2 text-sm">{item.actionLabel}</Link>
          </div>
        ))}
      </div>
      {hiddenCount > 0 && <p className="mt-3 text-sm font-bold text-slate-500">ほか {hiddenCount}件。上の項目を処理すると次の項目が表示されます。</p>}
    </Card>
  );
}

export async function DashboardView() {
  const user = await requireVerifiedUser();
  const dashboardNow = new Date();
  const dashboardCalendarDate = japanCalendarDate(dashboardNow);
  const dashboardMonthStart = new Date(Date.UTC(dashboardCalendarDate.getUTCFullYear(), dashboardCalendarDate.getUTCMonth(), 1));
  const dashboardNextMonth = new Date(Date.UTC(dashboardCalendarDate.getUTCFullYear(), dashboardCalendarDate.getUTCMonth() + 1, 1));
  const usagePeriods = buildUsagePeriods();
  const usageStart = usagePeriods.find((period) => period.key === "days365")?.start;
  const currentWeekStart = startOfJapanWeek();
  const closePeriod = monthlyClosePeriod();
  const decisionPeriod = renewalDecisionPeriod(dashboardNow);
  const [allSubscriptions, preference, announcements, usageRecords, weeklyUsageReviews, currentMonthlyClose, currentMonthHistories, currentRenewalDecisions, paymentHistoryCount] = (await Promise.all([
    prisma.subscription.findMany({
      where: { userId: user.id, deletedAt: null },
      include: { category: true, paymentMethod: true },
      orderBy: { nextBillingDate: "asc" },
    }),
    prisma.userPreference.findUnique({ where: { userId: user.id } }),
    getPublishedAnnouncements(DASHBOARD_ANNOUNCEMENT_MAX_ITEMS),
    prisma.subscriptionUsage.findMany({
      where: { userId: user.id, ...(usageStart ? { usedDate: { gte: usageStart } } : {}) },
      select: { subscriptionId: true, usedDate: true },
    }),
    prisma.weeklyUsageReview.findMany({
      where: { userId: user.id, weekStart: currentWeekStart },
      select: { subscriptionId: true, weekStart: true },
    }),
    prisma.monthlyClose.findUnique({
      where: {
        userId_year_month: {
          userId: user.id,
          year: closePeriod.year,
          month: closePeriod.month,
        },
      },
      select: { id: true },
    }),
    prisma.paymentHistory.findMany({
      where: { userId: user.id, paidAt: { gte: dashboardMonthStart, lt: dashboardNextMonth } },
      select: {
        id: true,
        subscriptionId: true,
        subscriptionNameSnapshot: true,
        amount: true,
        paidAt: true,
        accountingLabel: true,
        referenceNumber: true,
        referenceUrl: true,
      },
      orderBy: { paidAt: "desc" },
    }),
    prisma.savingChallenge.findMany({
      where: { userId: user.id, year: decisionPeriod.year, month: decisionPeriod.month },
      select: { subscriptionId: true },
    }),
    prisma.paymentHistory.count({ where: { userId: user.id } }),
  ])) as unknown as [
    SubscriptionView[],
    UserPreferenceView | null,
    AnnouncementView[],
    SubscriptionUsageView[],
    WeeklyUsageReviewView[],
    { id: string } | null,
    Array<{ id: string; subscriptionId: string; subscriptionNameSnapshot: string; amount: number; paidAt: Date; accountingLabel: string | null; referenceNumber: string | null; referenceUrl: string | null }>,
    Array<{ subscriptionId: string }>,
    number,
  ];
  const subscriptions = limitByPlan(allSubscriptions, user.plan);
  const usageBySubscription = usageDatesBySubscription(usageRecords);
  const usedTodayIds = new Set(
    Array.from(usageBySubscription.entries())
      .filter(([, usedDates]) => countUsageByPeriod(usedDates).today > 0)
      .map(([subscriptionId]) => subscriptionId),
  );
  const hiddenCount = hiddenByPlan(allSubscriptions.length, user.plan);
  const active = subscriptions.filter((item) => item.status === "ACTIVE");
  const activeSubscriptionIds = new Set(active.map((item) => item.id));
  const now = dashboardNow;
  const activeWithUpcomingBilling = active
    .map((item) => ({
      ...item,
      nextBillingDate: nextBillingOccurrence(item.nextBillingDate, item.billingCycle, item.customCycleDays, now),
    }))
    .sort((left, right) => left.nextBillingDate.getTime() - right.nextBillingDate.getTime());
  const monthlyTotal = active.reduce((sum, item) => sum + monthly(item.price, item.billingCycle, item.customCycleDays), 0);
  const businessMonthlyTotal = active.reduce(
    (sum, item) => sum + businessUseAmount(monthly(item.price, item.billingCycle, item.customCycleDays), item.businessUsePercent),
    0,
  );
  const budget = preference?.monthlyBudget ?? null;
  const budgetRate = budget ? percent(monthlyTotal, budget) : 0;
  const urgentItems = activeWithUpcomingBilling.filter((item) => isUpcomingWithin(item.nextBillingDate, 7) || (item.trialEndsAt && isUpcomingWithin(item.trialEndsAt, 7)) || (item.cancellationDeadline && isUpcomingWithin(item.cancellationDeadline, 7)));
  const reviewItems = active.filter((item) => needsReview(item.lastReviewedAt));
  const saving = active.reduce((sum, item) => sum + estimatedMonthlySaving(item), 0);
  const forecastSeries = buildForecastSeries(active);
  const forecastTotal = forecastSeries.reduce((sum, item) => sum + item.total, 0);
  const peakForecastMonth = forecastSeries.reduce(
    (best, item) => (item.total > best.total ? item : best),
    forecastSeries[0] ?? { key: "none", label: "未設定", total: 0, payments: 0 },
  );
  const cancelableCount = active.filter((item) => Boolean(safeExternalUrl(item.cancellationUrl))).length;
  const categoryCounts = active.reduce<Record<string, number>>((acc, item) => {
    const key = item.categoryId ?? "none";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const duplicateCategoryCount = Object.values(categoryCounts).reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const duplicateCategoryGroups = Object.values(categoryCounts).filter((count) => count > 1).length;
  const cancellationCoverage = active.length ? Math.round((cancelableCount / active.length) * 100) : 0;
  const scoredItems = activeWithUpcomingBilling.map((item) => reviewScore(item, categoryCounts[item.categoryId ?? "none"] ?? 1));
  const reviewPriorityCount = scoredItems.filter((item) => item.score >= REVIEW_CAUTION_SCORE_THRESHOLD).length;
  const lowUsageCount = active.filter((item) => item.usageFrequency === "RARELY" || item.priority === "OPTIONAL").length;
  const filledFields = active.reduce((sum, item) => {
    return sum + Number(Boolean(item.categoryId)) + Number(Boolean(item.paymentMethodId)) + Number(item.usageFrequency !== "UNKNOWN") + Number(Boolean(item.lastReviewedAt));
  }, 0);
  const dataQuality = active.length ? Math.round((filledFields / (active.length * 4)) * 100) : 100;
  const todayDueItems = activeWithUpcomingBilling.filter((item) => daysUntil(item.nextBillingDate, now) === 0);
  const weekDueItems = activeWithUpcomingBilling.filter((item) => isUpcomingWithin(item.nextBillingDate, 7));
  const dailyCheckItems = activeWithUpcomingBilling
    .map((item) => ({ ...item, dailyReason: dailyActionReason(item), dailyScore: dailyActionScore(item) }))
    .sort((a, b) => b.dailyScore - a.dailyScore || daysUntil(a.nextBillingDate) - daysUntil(b.nextBillingDate))
    .slice(0, 5);
  const budgetExceeded = Boolean(budget && monthlyTotal > budget);
  const subscriptionsWithUsageEvidence = active.filter((item) => (usageBySubscription.get(item.id)?.length ?? 0) > 0);
  const hasUsageData = subscriptionsWithUsageEvidence.length > 0;
  const unusedThisMonthCount = subscriptionsWithUsageEvidence
    .filter((item) => countUsageByPeriod(usageBySubscription.get(item.id) ?? []).month === 0).length;
  const unusedNinetyDaysCount = subscriptionsWithUsageEvidence
    .filter((item) => countUsageByPeriod(usageBySubscription.get(item.id) ?? []).days90 === 0).length;
  const healthScore = calculateSubscriptionHealth({
    hasUsageData,
    unusedThisMonthCount,
    unusedNinetyDaysCount,
    duplicateCategoryCount,
    budgetExceeded,
    cancellationCandidateCount: lowUsageCount,
  });
  const unusedSubscriptions = hasUsageData
    ? detectUnusedSubscriptions(active.map((item) => {
      const usageCounts = countUsageByPeriod(usageBySubscription.get(item.id) ?? []);
      return {
        id: item.id,
        name: item.name,
        createdAt: item.createdAt,
        hasUsageEvidence: (usageBySubscription.get(item.id)?.length ?? 0) > 0,
        usageDays30: usageCounts.days30,
        usageDays60: countUsageInRecentDays(usageBySubscription.get(item.id) ?? [], UNUSED_USAGE_WINDOWS[1]),
        usageDays90: usageCounts.days90,
      };
    }))
    : [];
  const categoryDuplicates = detectCategoryDuplicates(active.map((item) => ({
    id: item.id,
    name: item.name,
    categoryName: item.category?.name ?? null,
    monthlyCost: monthly(item.price, item.billingCycle, item.customCycleDays),
    usageDays30: (usageBySubscription.get(item.id)?.length ?? 0) > 0 ? countUsageByPeriod(usageBySubscription.get(item.id) ?? []).days30 : null,
  })));
  const duplicateCategoryIds = new Set(categoryDuplicates.flatMap((group) => group.subscriptions.map((subscription) => subscription.id)));
  const highestMonthlyCost = active.reduce((highest, item) => Math.max(highest, monthly(item.price, item.billingCycle, item.customCycleDays)), 0);
  const cancellationCandidates = detectCancellationCandidates(active.map((item) => {
    const usageCounts = countUsageByPeriod(usageBySubscription.get(item.id) ?? []);
    return {
      id: item.id,
      name: item.name,
      monthlyCost: monthly(item.price, item.billingCycle, item.customCycleDays),
      unusedDays: (usageBySubscription.get(item.id)?.length ?? 0) === 0 ? 0 : usageCounts.days90 === 0 ? 90 : usageCounts.days30 === 0 ? 30 : 0,
      usageFrequency: item.usageFrequency,
      priority: item.priority,
      duplicateCategory: duplicateCategoryIds.has(item.id),
      isHighCost: highestMonthlyCost > 0 && monthly(item.price, item.billingCycle, item.customCycleDays) === highestMonthlyCost,
    };
  }), MONTHS_PER_YEAR);
  const currentMonthPayment = activeWithUpcomingBilling.filter((item) => item.nextBillingDate.getFullYear() === now.getFullYear() && item.nextBillingDate.getMonth() === now.getMonth()).reduce((total, item) => total + item.price, 0);
  const nextPayment = activeWithUpcomingBilling[0] ?? null;
  const dailyFixedCost = monthlyTotal / AVERAGE_DAYS_PER_MONTH;
  const candidateAnnualSaving = cancellationCandidates.reduce((total, candidate) => total + candidate.annualSaving, 0);
  const weeklyReviewBySubscription = new Map(
    weeklyUsageReviews.map((review) => [review.subscriptionId, review.weekStart]),
  );
  const currentMonthPaymentIds = new Set(currentMonthHistories.map((history) => history.subscriptionId));
  const currentRenewalDecisionIds = new Set(currentRenewalDecisions.map((decision) => decision.subscriptionId));
  const weeklyReviewItems = active.filter((item) => needsWeeklyReview({
    lastReviewedAt: item.lastReviewedAt,
    usedDates: usageBySubscription.get(item.id) ?? [],
    weeklyReviewedAt: weeklyReviewBySubscription.get(item.id) ?? null,
  }));
  const weeklyReviewIds = new Set(weeklyReviewItems.map((item) => item.id));
  const dashboardReconciliation = isPremiumPlan(user.plan)
    ? reconcileBillingPeriod({
        subscriptions: active,
        payments: currentMonthHistories.filter((history) => activeSubscriptionIds.has(history.subscriptionId)),
        rangeStart: dashboardMonthStart,
        rangeEnd: dashboardNextMonth,
        now,
      })
    : null;
  const actionTasks = buildActionInbox({
    subscriptions: activeWithUpcomingBilling.map((item) => ({
      id: item.id,
      name: item.name,
      nextBillingDate: item.nextBillingDate,
      trialEndsAt: item.trialEndsAt,
      cancellationDeadline: item.cancellationDeadline,
      paymentRecordedForCycle: currentMonthPaymentIds.has(item.id),
      renewalDecisionRecorded: currentRenewalDecisionIds.has(item.id),
      weeklyReviewNeeded: weeklyReviewIds.has(item.id),
    })),
    payments: currentMonthHistories.filter((history) => activeSubscriptionIds.has(history.subscriptionId)).map((history) => ({
      id: history.id,
      subscriptionId: history.subscriptionId,
      subscriptionName: history.subscriptionNameSnapshot,
      paidAt: history.paidAt,
      accountingLabel: history.accountingLabel,
      referenceNumber: history.referenceNumber,
      referenceUrl: history.referenceUrl,
    })),
    monthlyCloseCompleted: Boolean(currentMonthlyClose),
    budgetExceeded,
    premium: isPremiumPlan(user.plan),
    reconciliation: dashboardReconciliation
      ? {
          items: dashboardReconciliation.items,
          unmatchedPayments: dashboardReconciliation.unmatchedPayments.map((payment) => ({
            ...payment,
            subscriptionName: currentMonthHistories.find((history) => history.id === payment.id)?.subscriptionNameSnapshot ?? "登録済みサブスク",
          })),
        }
      : undefined,
    now,
  });
  const operationScore = calculateOperationScore({
    urgentCount: urgentItems.length,
    reviewCount: reviewPriorityCount,
    lowUsageCount,
    dataQuality,
    monthlyTotal,
    monthlyBudget: budget,
    monthlyCloseCompleted: Boolean(currentMonthlyClose),
  });
  const categoryTotals = active.reduce<Record<string, number>>((acc, item) => {
    const name = item.category?.name ?? "未分類";
    acc[name] = (acc[name] ?? 0) + monthly(item.price, item.billingCycle, item.customCycleDays);
    return acc;
  }, {});

  return (
    <AppShell>
      <PageHeader title="ダッシュボード" description="登録済みサブスクリプションの月額、更新予定、期限リスク、見直し候補を確認します。" action={<Link href="/subscriptions/new" className="btn-primary">サブスク追加</Link>} />
      <SetupChecklistCard
        subscriptionCount={allSubscriptions.length}
        hasCategory={active.some((item) => Boolean(item.categoryId))}
        hasPaymentMethod={active.some((item) => Boolean(item.paymentMethodId))}
        hasBudget={Boolean(budget)}
        hasBusinessUse={active.some((item) => item.businessUsePercent > 0)}
        hasReviewData={active.some((item) => item.usageFrequency !== "UNKNOWN" && Boolean(item.lastReviewedAt))}
        hasUsageData={hasUsageData}
        paymentHistoryCount={paymentHistoryCount}
        monthlyCloseCompleted={Boolean(currentMonthlyClose)}
        premium={isPremiumPlan(user.plan)}
      />
      <PlanLimitBanner hiddenCount={hiddenCount} />
      <ActionInboxCard tasks={actionTasks} />
      <TodaySubscListCard dailyFixedCost={dailyFixedCost} currentMonthPayment={currentMonthPayment} nextPayment={nextPayment} unusedCount={unusedThisMonthCount} candidateCount={cancellationCandidates.length} annualSaving={candidateAnnualSaving} healthScore={healthScore} premium={isPremiumPlan(user.plan)} />
      <DailyCommandCenter todayDue={todayDueItems} weekDue={weekDueItems} checkItems={dailyCheckItems} monthlyTotal={monthlyTotal} budget={budget} usedTodayIds={usedTodayIds} />
      <HealthScoreCard result={healthScore} />
      <UnusedSubscriptionsCard items={unusedSubscriptions} />
      <CategoryDuplicatesCard groups={categoryDuplicates} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ["月額合計", yen.format(monthlyTotal), "from-blue-600 to-cyan-500"],
            ["年額換算", yen.format(monthlyTotal * MONTHS_PER_YEAR), "from-slate-900 to-blue-700"],
            ["仕事利用分（月額見込み）", yen.format(businessMonthlyTotal), "from-emerald-600 to-cyan-600"],
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
        <DashboardAnnouncements announcements={announcements} />
      </div>
      {isPremiumPlan(user.plan) ? (
        <>
          <PremiumValueCard monthlyTotal={monthlyTotal} saving={saving} reviewCount={reviewItems.length} urgentCount={urgentItems.length} />
          <OperationalCommandCard score={operationScore} dataQuality={dataQuality} urgentCount={urgentItems.length} reviewCount={reviewPriorityCount} lowUsageCount={lowUsageCount} budgetRate={budget ? budgetRate : 0} budgetExceeded={budgetExceeded} monthlyCloseCompleted={Boolean(currentMonthlyClose)} />
          <PremiumForecastCard
            series={forecastSeries}
            forecastTotal={forecastTotal}
            peakMonth={peakForecastMonth}
            cancellationCoverage={cancellationCoverage}
            missingCancellationCount={active.length - cancelableCount}
            duplicateCategoryCount={duplicateCategoryCount}
            duplicateCategoryGroups={duplicateCategoryGroups}
          />
        </>
      ) : (
        <div className="mt-6"><PremiumOnlyNotice title="見直し・予測・運用分析" description="Premiumでは削減見込み、優先アクション、12ヶ月の支払い予測、解約導線の不足を実データから確認できます。" /></div>
      )}
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
            {activeWithUpcomingBilling.length === 0 ? <EmptyState text="登録済みのサブスクリプションはありません。" /> : activeWithUpcomingBilling.slice(0, 5).map((item) => (
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

export async function SubscriptionsView({ filters }: { filters: SubscriptionListFilters }) {
  const user = await requireVerifiedUser();
  const usageStart = buildUsagePeriods().find((period) => period.key === "days365")?.start;
  const [allSubscriptions, usageRecords, categoryOptions, paymentMethodOptions] = (await Promise.all([
    prisma.subscription.findMany({
      where: { userId: user.id, deletedAt: null },
      include: { category: true, paymentMethod: true },
      orderBy: { nextBillingDate: "asc" },
    }),
    prisma.subscriptionUsage.findMany({
      where: { userId: user.id, ...(usageStart ? { usedDate: { gte: usageStart } } : {}) },
      select: { subscriptionId: true, usedDate: true },
    }),
    prisma.category.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    prisma.paymentMethod.findMany({
      where: { userId: user.id, type: { in: [...stripePaymentMethodTypes] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, memo: true },
    }),
  ])) as unknown as [SubscriptionView[], SubscriptionUsageView[], CategoryView[], PaymentMethodView[]];
  const listReferenceDate = new Date();
  const visibleSubscriptions = limitByPlan(allSubscriptions, user.plan).map((item) => item.status === "ACTIVE" ? {
    ...item,
    nextBillingDate: nextBillingOccurrence(item.nextBillingDate, item.billingCycle, item.customCycleDays, listReferenceDate),
  } : item);
  const subscriptions = filterAndSortSubscriptions(visibleSubscriptions.map((item) => ({
    ...item,
    categoryName: item.category?.name ?? null,
    paymentMethodName: item.paymentMethod?.name ?? null,
    cancellationRouteReady: Boolean(safeExternalUrl(item.cancellationUrl)),
    setupComplete: Boolean(
      item.categoryId
      && item.paymentMethodId
      && safeExternalUrl(item.cancellationUrl)
      && item.usageFrequency !== "UNKNOWN"
      && item.priority !== "UNKNOWN"
    ),
    reviewDue: needsReview(item.lastReviewedAt),
    monthlyCost: monthly(item.price, item.billingCycle, item.customCycleDays),
  })), filters);
  const usageBySubscription = usageDatesBySubscription(usageRecords);
  const hiddenCount = hiddenByPlan(allSubscriptions.length, user.plan);
  const filtersApplied = hasSubscriptionListFilters(filters);
  const bulkEditorKey = [filters.query, filters.status, filters.categoryId, filters.dataState, filters.sort].join("|");
  return (
    <AppShell>
      <PageHeader title="サブスク一覧" description="登録済みサブスクリプションだけを表示します。" action={<Link href="/subscriptions/new" className="btn-primary">新規登録</Link>} />
      <PlanLimitBanner hiddenCount={hiddenCount} />
      {visibleSubscriptions.length > 0 && (
        <Card className="mb-5">
          <form action="/subscriptions" method="get" className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_repeat(4,minmax(130px,0.8fr))_auto] xl:items-end">
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">検索</span>
              <input name="q" type="search" defaultValue={filters.query} maxLength={SUBSCRIPTION_LIST_QUERY_MAX_LENGTH} className="input" placeholder="サービス名・メモなど" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">状態</span>
              <select name="status" defaultValue={filters.status} className="input">
                <option value="ALL">すべて</option>
                <option value="ACTIVE">契約中</option>
                <option value="PAUSED">一時停止</option>
                <option value="CANCELED">解約済み</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">カテゴリ</span>
              <select name="category" defaultValue={filters.categoryId} className="input">
                <option value="">すべて</option>
                {categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">データ状態</span>
              <select name="data" defaultValue={filters.dataState} className="input">
                <option value="ALL">すべて</option>
                <option value="NEEDS_SETUP">要整理</option>
                <option value="MISSING_CANCELLATION">解約URL未設定</option>
                <option value="REVIEW_DUE">見直し期限超過</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">並べ替え</span>
              <select name="sort" defaultValue={filters.sort} className="input">
                <option value="RENEWAL">次回更新が近い順</option>
                <option value="COST_DESC">月額が高い順</option>
                <option value="NAME">名前順</option>
              </select>
            </label>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1 justify-center px-4">適用</button>
              {filtersApplied && <Link href="/subscriptions" className="btn-secondary justify-center px-4">解除</Link>}
            </div>
          </form>
          <p className="mt-4 text-sm font-semibold text-slate-600">表示 {subscriptions.length}件 / 管理対象 {visibleSubscriptions.length}件</p>
        </Card>
      )}
      <SubscriptionBulkEditor
        key={bulkEditorKey}
        subscriptions={subscriptions.map((item) => ({
          id: item.id,
          name: item.name,
          categoryName: item.categoryName,
          paymentMethodName: item.paymentMethodName,
        }))}
        categories={categoryOptions}
        paymentMethods={paymentMethodOptions}
      />
      {visibleSubscriptions.length === 0 ? <Card><EmptyState text="まだサブスクリプションが登録されていません。" /></Card> : subscriptions.length === 0 ? (
        <Card>
          <EmptyState text="条件に一致するサブスクリプションはありません。" />
          <Link href="/subscriptions" className="btn-secondary mt-4 inline-flex">絞り込みを解除</Link>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {subscriptions.map((item) => {
            const missingFields = [
              !item.categoryId && "カテゴリ",
              !item.paymentMethodId && "支払い方法",
              !item.cancellationRouteReady && "解約URL",
              item.usageFrequency === "UNKNOWN" && "利用頻度",
              item.priority === "UNKNOWN" && "重要度",
            ].filter(Boolean) as string[];
            return (
            <div key={item.id} className="group rounded-lg border border-white/75 bg-white/92 p-5 shadow-[0_14px_35px_rgba(15,23,42,0.07)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_22px_48px_rgba(37,99,235,0.14)]">
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
              {missingFields.length > 0 && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold leading-6 text-amber-900">
                  要整理: {missingFields.join("・")}
                </p>
              )}
              <div className="mt-3">
                <DailyUsageCheckButtons id={item.id} compact usedToday={countUsageByPeriod(usageBySubscription.get(item.id) ?? []).today > 0} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link href={`/subscriptions/${item.id}`} className="btn-secondary min-h-0 justify-center px-3 py-2 text-sm">
                  詳細
                </Link>
                <Link href={`/subscriptions/${item.id}/edit`} className="btn-primary min-h-0 justify-center px-3 py-2 text-sm">
                  編集
                </Link>
              </div>
            </div>
          );})}
        </div>
      )}
    </AppShell>
  );
}

export async function SubscriptionFormView({ id }: { id?: string }) {
  const user = await requireVerifiedUser();
  const [subscriptionRecord, categories, paymentMethods, preference, activeSubscriptions] = await Promise.all([
    id ? prisma.subscription.findFirst({
      where: { id, userId: user.id, deletedAt: null },
      include: {
        notificationSettings: {
          where: { userId: user.id },
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { enabled: true, daysBefore: true },
        },
      },
    }) : Promise.resolve(null),
    prisma.category.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    prisma.paymentMethod.findMany({ where: { userId: user.id, type: { in: [...stripePaymentMethodTypes] } }, orderBy: { name: "asc" } }),
    prisma.userPreference.findUnique({ where: { userId: user.id } }),
    prisma.subscription.findMany({ where: { userId: user.id, deletedAt: null, status: "ACTIVE", ...(id ? { id: { not: id } } : {}) }, select: { price: true, billingCycle: true, customCycleDays: true } }),
  ]);
  const subscription = subscriptionRecord
    ? {
        ...subscriptionRecord,
        notificationsEnabled: effectiveSubscriptionNotification({
          settings: subscriptionRecord.notificationSettings,
          subscriptionDaysBefore: subscriptionRecord.notifyDaysBefore,
          fallbackDaysBefore:
            preference?.defaultNotifyDaysBefore
            ?? DEFAULT_NOTIFY_DAYS_BEFORE,
        }).enabled,
      }
    : null;
  if (id && !subscription) notFound();
  if (!id && !isPremiumPlan(user.plan)) {
    const count = await prisma.subscription.count({ where: { userId: user.id, deletedAt: null } });
    if (count >= FREE_SUBSCRIPTION_LIMIT) {
      return <AppShell><PageHeader title="サブスク登録" description="Freeプランの登録上限に達しています。" /><PremiumOnlyNotice title="Freeプランの登録上限に達しています" description={`Freeプランではサブスク登録は${FREE_SUBSCRIPTION_LIMIT}件までです。Premiumに変更すると無制限に登録できます。`} /></AppShell>;
    }
  }
  const currentMonthlyTotal = activeSubscriptions.reduce((total, item) => total + monthly(item.price, item.billingCycle, item.customCycleDays), 0);
  return (
    <AppShell>
      <PageHeader title={subscription ? "サブスク編集" : "サブスク登録"} description="サブスクリプション情報をDBへ保存します。" />
      <Card><SubscriptionForm subscription={subscription} categories={categories} paymentMethods={paymentMethods} monthlyBudget={preference?.monthlyBudget ?? null} currentMonthlyTotal={currentMonthlyTotal} defaultNotifyDaysBefore={preference?.defaultNotifyDaysBefore ?? DEFAULT_NOTIFY_DAYS_BEFORE} /></Card>
    </AppShell>
  );
}

export async function SubscriptionDetailView({ id }: { id: string }) {
  const user = await requireVerifiedUser();
  const item = (await prisma.subscription.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    include: {
      category: true,
      paymentMethod: true,
      paymentHistories: { orderBy: { paidAt: "desc" } },
      statementMerchantAliases: {
        orderBy: { createdAt: "asc" },
        select: { id: true, merchantLabel: true },
      },
    },
  })) as unknown as SubscriptionView | null;
  if (!item) notFound();
  const upcomingBillingDate = item.status === "ACTIVE"
    ? nextBillingOccurrence(item.nextBillingDate, item.billingCycle, item.customCycleDays)
    : item.nextBillingDate;
  const usageStart = buildUsagePeriods().find((period) => period.key === "days365")?.start;
  const usageRecords = (await prisma.subscriptionUsage.findMany({
    where: { userId: user.id, subscriptionId: item.id, ...(usageStart ? { usedDate: { gte: usageStart } } : {}) },
    select: { usedDate: true },
  })) as Array<{ usedDate: Date }>;
  const usedDates = usageRecords.map((record) => record.usedDate);
  const priceHistories = (await prisma.subscriptionPriceHistory.findMany({
    where: { userId: user.id, subscriptionId: item.id },
    select: { id: true, price: true, billingCycle: true, customCycleDays: true, effectiveFrom: true },
    orderBy: { effectiveFrom: "asc" },
  })) as PriceHistoryView[];
  const sameCategoryCount = item.categoryId
    ? await prisma.subscription.count({ where: { userId: user.id, deletedAt: null, status: "ACTIVE", categoryId: item.categoryId } })
    : 1;
  const score = reviewScore({ ...item, nextBillingDate: upcomingBillingDate }, sameCategoryCount);
  const saving = estimatedMonthlySaving(item);
  const cancellationPageUrl = safeExternalUrl(item.cancellationUrl);
  const billingGuide = billingProviderGuide(item.billingProvider);
  const billingManagementUrl = safeExternalUrl(billingGuide.managementUrl);
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
  const decisionHistory = (await prisma.savingChallenge.findMany({
    where: { subscriptionId: item.id, userId: user.id },
    orderBy: { decidedAt: "desc" },
    take: RENEWAL_DECISION_HISTORY_LIMIT,
  })) as unknown as SavingChallengeView[];
  const decisionPeriod = renewalDecisionPeriod();
  const currentDecision = decisionHistory.find(
    (decision) => decision.year === decisionPeriod.year && decision.month === decisionPeriod.month,
  );
  const completedChecklistCount = checklist.filter((entry) => entry.completedAt).length;
  const invoiceCurrency = isSubscriptionCurrency(item.currency)
    ? item.currency
    : "JPY";
  const originalBillingAmount =
    invoiceCurrency !== "JPY" && item.sourceAmountMinor !== null
      ? `${invoiceCurrency} ${formatSourceAmountMinor(item.sourceAmountMinor, invoiceCurrency)}`
      : null;
  const exchangeRateText =
    invoiceCurrency !== "JPY" && item.exchangeRateToJpyScaled !== null
      ? `1 ${invoiceCurrency} = ${formatExchangeRateScaled(item.exchangeRateToJpyScaled)}円`
      : null;
  return (
    <AppShell>
      <PageHeader title={item.name} description="登録内容、次回更新日、年間換算額を確認します。" action={<Link href={`/subscriptions/${item.id}/edit`} className="btn-primary">編集</Link>} />
      <div className="grid gap-5 lg:grid-cols-[1fr_0.75fr]">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Info label="請求額（円換算）" value={yen.format(item.price)} />
            <Info label="請求通貨" value={invoiceCurrency} />
            {originalBillingAmount && <Info label="原通貨の請求額" value={originalBillingAmount} />}
            {exchangeRateText && <Info label="円換算レート" value={exchangeRateText} />}
            {exchangeRateText && <Info label="換算レート確認日" value={dateText(item.exchangeRateUpdatedAt)} />}
            <Info label="月額換算" value={yen.format(monthly(item.price, item.billingCycle, item.customCycleDays))} />
            <Info label="年額換算" value={yen.format(annualAmount(item.price, item.billingCycle, item.customCycleDays))} />
            <Info label="利用区分" value={businessUseLabel(item.businessUsePercent)} />
            <Info label="仕事利用分（月額見込み）" value={yen.format(businessUseAmount(monthly(item.price, item.billingCycle, item.customCycleDays), item.businessUsePercent))} />
            <Info label="整理用初期科目" value={item.defaultAccountingLabel ?? "未設定"} />
            <Info label="次回更新日" value={isoDate(upcomingBillingDate)} />
            <Info label="ステータス" value={item.status} />
            <Info label="カテゴリ" value={item.category?.name ?? "未分類"} />
            <Info label="支払い方法" value={item.paymentMethod?.name ?? "未設定"} />
            <Info label="請求元" value={billingProviderLabel(item.billingProvider)} />
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
            <p className="mt-4 text-sm font-semibold text-blue-900">確度補正後の削減試算: 月 {yen.format(saving)} / 年 {yen.format(saving * MONTHS_PER_YEAR)}</p>
          </div>
          <p className="mt-5 rounded-lg border border-slate-100 bg-slate-50/80 p-4 text-sm font-medium leading-6 text-slate-600">{item.memo || "メモは登録されていません。"}</p>
        </Card>
        <Card>
          <h2 className="mb-4 font-bold">操作</h2>
          <DailyUsageCheckButtons id={item.id} usedToday={countUsageByPeriod(usedDates).today > 0} />
          <div className="my-4 border-t border-slate-100" />
          <SubscriptionActions id={item.id} />
        </Card>
      </div>
      <UsageSummary usedDates={usedDates} price={item.price} billingCycle={item.billingCycle} customCycleDays={item.customCycleDays} />
      <Card className="mt-5">
        <StatementMerchantAliasesForm
          subscriptionId={item.id}
          aliases={item.statementMerchantAliases ?? []}
          canAdd={isPremiumPlan(user.plan)}
        />
      </Card>
      {isPremiumPlan(user.plan) && <PriceHistoryCard histories={priceHistories} currentPrice={item.price} currentBillingCycle={item.billingCycle} currentCustomCycleDays={item.customCycleDays} />}
      {(isPremiumPlan(user.plan) || item.scheduledPrice !== null) && (
        <Card className="mt-5">
          <ScheduledPriceForm
            subscriptionId={item.id}
            currentPrice={item.price}
            scheduledPrice={item.scheduledPrice}
            scheduledPriceAt={item.scheduledPriceAt ? isoDate(item.scheduledPriceAt) : null}
            today={isoDate(japanCalendarDate())}
            isDue={Boolean(
              item.scheduledPriceAt
              && japanCalendarDate(item.scheduledPriceAt).getTime() <= japanCalendarDate().getTime()
            )}
            canSchedule={isPremiumPlan(user.plan)}
          />
        </Card>
      )}
      {isPremiumPlan(user.plan) ? (
        <>
          <Card className="mt-5">
            <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
              <div>
                <p className="text-sm font-black text-blue-700">RENEWAL DECISION</p>
                <h2 className="mt-2 text-lg font-bold">次回更新の判断を残す</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">継続理由や再検討条件を記録すると、次回の見直しで同じ調査を繰り返さずに済みます。判断だけで契約状態は変わりません。</p>
                <div className="mt-4">
                  <RenewalDecisionForm
                    subscriptionId={item.id}
                    renewalDate={upcomingBillingDate}
                    currentStatus={renewalDecisionStatus(currentDecision?.status)}
                    currentReason={currentDecision?.reason ?? ""}
                  />
                </div>
              </div>
              <div>
                <h3 className="font-bold">判断履歴</h3>
                <div className="mt-3 divide-y divide-slate-100">
                  {decisionHistory.length === 0 ? <EmptyState text="更新判断はまだ記録されていません。" /> : decisionHistory.map((decision) => (
                    <div key={decision.id} className="grid gap-2 py-3 sm:grid-cols-[100px_1fr_auto] sm:items-start">
                      <p className="text-sm font-bold text-slate-500">{decision.year}年{decision.month}月</p>
                      <div>
                        <p className="font-bold">対象更新 {isoDate(decision.renewalDate)}</p>
                        <p className="mt-1 text-sm text-slate-500">月額換算 {yen.format(decision.potentialMonthlySaving)} / 判断日 {isoDate(decision.decidedAt)}</p>
                        {decision.reason && <p className="mt-2 text-sm leading-6 text-slate-600">{decision.reason}</p>}
                      </div>
                      <span className="w-fit rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-800">{renewalDecisionStatusLabel(decision.status)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
          <Card className="mt-5">
            <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <h2 className="text-lg font-bold">解約支援</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">解約を検討してから完了するまでの状態、予定日、問い合わせ番号や手順メモを残します。</p>
                <div className="mt-4 border-y border-blue-100 bg-blue-50/70 py-4">
                  <p className="text-xs font-black text-blue-700">実際の請求元</p>
                  <p className="mt-1 font-black text-blue-950">{billingGuide.label}</p>
                  <p className="mt-2 text-sm font-medium leading-6 text-blue-900">{billingGuide.description}</p>
                  <ol className="mt-3 space-y-1 text-sm font-semibold text-slate-700">
                    {billingGuide.steps.map((step, index) => <li key={step}>{index + 1}. {step}</li>)}
                  </ol>
                </div>
                <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                  <p className="text-sm font-black text-slate-700">進捗 {completedChecklistCount}/{checklist.length}</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-blue-600" style={{ width: `${checklist.length ? Math.round((completedChecklistCount / checklist.length) * 100) : 0}%` }} />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {billingManagementUrl && <Link href={billingManagementUrl} target="_blank" rel="noreferrer" className="btn-primary">請求元で契約を管理</Link>}
                  {cancellationPageUrl && cancellationPageUrl !== billingManagementUrl && (
                    <Link href={cancellationPageUrl} target="_blank" rel="noreferrer" className="btn-secondary">
                      {billingGuide.value === "DIRECT" ? "解約ページを開く" : "サービス側の解約案内"}
                    </Link>
                  )}
                </div>
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
              <PaymentHistoryForm
                subscriptionId={item.id}
                defaultAmount={item.price}
                defaultAccountingLabel={item.defaultAccountingLabel}
              />
            </div>
          </div>
          <div>
            <h2 className="font-bold">支払い履歴</h2>
            <div className="mt-4">
          {item.paymentHistories.length === 0 ? <EmptyState text="支払い履歴はまだ登録されていません。" /> : item.paymentHistories.map((history) => {
            const evidenceUrl = safeExternalUrl(history.referenceUrl);
            return (
              <div key={history.id} className="flex flex-col gap-3 border-b border-slate-100 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-bold">{isoDate(history.paidAt)} / {yen.format(history.amount)}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {[history.accountingLabel, history.referenceNumber].filter(Boolean).join(" / ") || "整理情報未設定"}
                  </p>
                  {history.memo && <p className="mt-1 text-sm text-slate-500">{history.memo}</p>}
                  {evidenceUrl && <Link href={evidenceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-sm font-bold text-blue-700 hover:text-blue-900">証憑を開く</Link>}
                  <PaymentHistoryEditForm history={history} />
                </div>
                <DeletePaymentHistoryButton id={history.id} />
              </div>
            );
          })}
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
  const methods = (await prisma.paymentMethod.findMany({ where: { userId: user.id, type: { in: [...stripePaymentMethodTypes] } }, orderBy: { name: "asc" } })) as unknown as PaymentMethodView[];
  return <AppShell><PageHeader title="支払い方法" description="Stripeで決済できる支払い方法だけを管理します。" /><div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]"><Card><PaymentMethodForm /></Card><Card><div className="divide-y divide-slate-100">{methods.length === 0 ? <EmptyState text="支払い方法がありません。" /> : methods.map((item) => <div key={item.id} className="py-3"><p className="font-semibold">{item.name}</p><p className="text-sm text-slate-500">{paymentMethodTypeLabel(item.type)}{item.memo ? ` / ${item.memo}` : ""}</p></div>)}</div></Card></div></AppShell>;
}

export async function PaymentsView({ year, organization: organizationQuery, missing }: { year?: string; organization?: string; missing?: string } = {}) {
  const user = await requireVerifiedUser();
  const today = new Date();
  const currentKey = yearMonthKey(today);
  const allowHistoricalFilter = isPremiumPlan(user.plan);
  const selectedFilter = resolvePaymentHistoryFilter({
    year: allowHistoricalFilter ? year : undefined,
    organization: organizationQuery,
    missing,
  }, today);
  const currentMonthFilter = resolvePaymentHistoryFilter({}, today);
  const [allSubscriptions, historyDates] = (await Promise.all([
    prisma.subscription.findMany({
      where: { userId: user.id, deletedAt: null, status: "ACTIVE" },
      include: {
        category: true,
        paymentMethod: true,
        paymentHistories: { orderBy: { paidAt: "desc" }, take: 12 },
      },
      orderBy: { nextBillingDate: "asc" },
    }),
    prisma.paymentHistory.findMany({
      where: { userId: user.id, paidAt: { lte: today } },
      select: { paidAt: true },
    }),
  ])) as unknown as [SubscriptionView[], Array<{ paidAt: Date }>];
  const subscriptions = limitByPlan(allSubscriptions, user.plan).map((item) => ({
    ...item,
    nextBillingDate: nextBillingOccurrence(item.nextBillingDate, item.billingCycle, item.customCycleDays, today),
  }));
  const hiddenCount = hiddenByPlan(allSubscriptions.length, user.plan);
  const currentMonthHistories = (await prisma.paymentHistory.findMany({
    where: { userId: user.id, paidAt: { gte: currentMonthFilter.start, lt: currentMonthFilter.end } },
    include: { subscription: true },
    orderBy: { paidAt: "desc" },
  })) as unknown as PaymentHistoryView[];
  const selectedPeriodHistories = selectedFilter.year === null
    ? currentMonthHistories
    : (await prisma.paymentHistory.findMany({
        where: { userId: user.id, paidAt: { gte: selectedFilter.start, lt: selectedFilter.end } },
        include: { subscription: true },
        orderBy: { paidAt: "desc" },
      })) as unknown as PaymentHistoryView[];
  const matchingHistories = selectedPeriodHistories.filter((item) =>
    matchesPaymentHistoryFilter(item, selectedFilter.organization, selectedFilter.missing),
  );
  const visibleHistories = matchingHistories.slice(0, PAYMENT_HISTORY_DISPLAY_LIMIT);
  const hiddenHistoryCount = Math.max(0, matchingHistories.length - visibleHistories.length);
  const paymentHistoryBulkGroups = [...visibleHistories.reduce<Map<string, PaymentHistoryBulkGroup>>((groups, history) => {
    if (history.accountingLabel) return groups;
    const existing = groups.get(history.subscriptionId);
    if (existing) existing.historyIds.push(history.id);
    else groups.set(history.subscriptionId, {
      subscriptionId: history.subscriptionId,
      subscriptionName: history.subscriptionNameSnapshot,
      categoryName: history.categoryNameSnapshot,
      historyIds: [history.id],
    });
    return groups;
  }, new Map()).values()];
  const organizationFilterValue = selectedFilter.organization === "MISSING"
    ? "missing"
    : selectedFilter.organization === "ORGANIZED" ? "organized" : "all";
  const missingFilterValue = selectedFilter.missing === "ACCOUNTING"
    ? "accounting"
    : selectedFilter.missing === "EVIDENCE" ? "evidence" : "any";
  const availableHistoryYears = [...new Set([
    japanCalendarDate(today).getUTCFullYear(),
    ...historyDates.map((item) => japanCalendarDate(item.paidAt).getUTCFullYear()),
  ])].sort((left, right) => right - left);
  const paidTotal = currentMonthHistories.reduce((sum, item) => sum + item.amount, 0);
  const organization = summarizePaymentOrganization(currentMonthHistories);
  const unorganizedHistories = currentMonthHistories.filter((item) => paymentOrganizationMissing(item).length > 0);
  const dueThisMonth = subscriptions.filter((item) => yearMonthKey(item.nextBillingDate) === currentKey);
  const confirmedThisMonth = dueThisMonth.filter((item) => item.paymentHistories.some((history) => yearMonthKey(history.paidAt) === currentKey));
  const awaiting = dueThisMonth.filter((item) => daysUntil(item.nextBillingDate, today) === 0 && !item.paymentHistories.some((history) => yearMonthKey(history.paidAt) === currentKey));
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

      <Card className="mt-6 border-cyan-100 bg-white/92">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black text-cyan-700">MONTHLY ORGANIZATION</p>
            <h2 className="mt-2 text-xl font-black text-slate-950">今月の証憑整理</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600">整理用科目と、領収書・請求書番号または証憑URLの両方が揃うと整理完了です。</p>
          </div>
          <p className="text-3xl font-black text-slate-950">{organization.totalCount === 0 ? "-" : `${organization.completionPercent}%`}</p>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="今月の証憑整理率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={organization.completionPercent}>
          <div className="h-full rounded-full bg-cyan-600" style={{ width: `${organization.completionPercent}%` }} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["支払い記録", `${organization.totalCount}件`],
            ["科目設定済み", `${organization.labeledCount}件`],
            ["証憑紐付け済み", `${organization.evidencedCount}件`],
            ["未整理", `${organization.missingCount}件`],
          ].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 text-xl font-black text-slate-950">{value}</p></div>)}
        </div>
        {unorganizedHistories.length > 0 && <Link href="/payments?organization=missing#payment-history-list" className="mt-4 inline-flex text-sm font-black text-blue-700 hover:text-blue-900">未整理の支払いを確認</Link>}
      </Card>

      <div className="mt-6 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <h2 className="text-lg font-bold">支払いを記録</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">支払い確認済みの金額と、月次整理に必要な領収書番号・証憑URLをまとめて記録します。</p>
          <div className="mt-5">
            <PaymentHistoryForm subscriptions={subscriptions.map((item) => ({
              id: item.id,
              name: item.name,
              price: item.price,
              defaultAccountingLabel: item.defaultAccountingLabel,
            }))} />
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

      <Card id="payment-history-list" className="mt-6 scroll-mt-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-bold">支払い履歴の整理</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{selectedFilter.periodLabel} / {paymentHistoryFilterLabel(selectedFilter.organization, selectedFilter.missing)} {matchingHistories.length}件</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedFilter.year !== null && <Link href={`/annual-report?year=${selectedFilter.year}`} className="btn-secondary min-h-0 px-4 py-2 text-sm">年間整理レポートへ戻る</Link>}
            <Link href="/payments#payment-history-list" className="btn-secondary min-h-0 px-4 py-2 text-sm">条件をリセット</Link>
          </div>
        </div>
        <form method="get" action="/payments" className="mt-5 grid gap-4 rounded-lg border border-slate-200 bg-slate-50/80 p-4 md:grid-cols-3 md:items-end">
          {allowHistoricalFilter ? (
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              対象期間
              <select name="year" defaultValue={selectedFilter.year ?? ""} className="input-base">
                <option value="">今月</option>
                {availableHistoryYears.map((optionYear) => <option key={optionYear} value={optionYear}>{optionYear}年</option>)}
              </select>
            </label>
          ) : (
            <div><p className="text-sm font-bold text-slate-700">対象期間</p><p className="mt-2 text-sm font-semibold text-slate-600">今月</p></div>
          )}
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            整理状態
            <select name="organization" defaultValue={organizationFilterValue} className="input-base">
              <option value="all">すべて</option>
              <option value="missing">未整理</option>
              <option value="organized">整理済み</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold text-slate-700">
            不足している項目
            <select name="missing" defaultValue={missingFilterValue} className="input-base">
              <option value="any">指定なし</option>
              <option value="accounting">整理用科目</option>
              <option value="evidence">証憑</option>
            </select>
          </label>
          <div className="md:col-span-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold leading-5 text-slate-500">不足項目は「未整理」を選んだ場合に適用されます。</p>
            <button type="submit" className="btn-primary min-h-0 px-5 py-2.5 text-sm">この条件で表示</button>
          </div>
        </form>
        {allowHistoricalFilter && <PaymentHistoryBulkOrganizer groups={paymentHistoryBulkGroups} />}
        <div className="mt-4 divide-y divide-slate-100">
          {visibleHistories.length === 0 ? <EmptyState text="条件に一致する支払い履歴はありません。" /> : visibleHistories.map((history) => {
            const evidenceUrl = safeExternalUrl(history.referenceUrl);
            return (
              <div key={history.id} className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 flex-1">
                  <Link href={`/subscriptions/${history.subscriptionId}`} className="font-bold text-slate-950 hover:text-blue-700">{history.subscriptionNameSnapshot}</Link>
                  <p className="mt-1 text-sm text-slate-500">{dateText(history.paidAt)} / {history.categoryNameSnapshot ?? "未分類"} / {history.paymentMethodNameSnapshot ?? "支払い方法未設定"}</p>
                  {(history.accountingLabel || history.referenceNumber || history.memo) && <p className="mt-1 text-sm text-slate-500">{[history.accountingLabel, history.referenceNumber, history.memo].filter(Boolean).join(" / ")}</p>}
                  {paymentOrganizationMissing(history).length > 0 && <p className="mt-2 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-800">未整理: {paymentOrganizationMissing(history).join("・")}</p>}
                  {evidenceUrl && <Link href={evidenceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-sm font-bold text-blue-700 hover:text-blue-900">証憑を開く</Link>}
                  <PaymentHistoryEditForm history={history} />
                </div>
                <div className="flex items-center justify-between gap-3 md:justify-end">
                  <p className="font-black">{yen.format(history.amount)}</p>
                  <DeletePaymentHistoryButton id={history.id} />
                </div>
              </div>
            );
          })}
        </div>
        {hiddenHistoryCount > 0 && <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">表示上限のため、残り{hiddenHistoryCount}件は条件を絞って確認してください。</p>}
      </Card>
    </AppShell>
  );
}

function paymentTrendDriverLabel(kind: PaymentTrendDriver["kind"]) {
  if (kind === "NEW") return "新規発生";
  if (kind === "ENDED") return "支払い終了";
  if (kind === "INCREASE") return "増額";
  return "減額";
}

export async function AnnualBusinessReportView({ year }: { year?: string } = {}) {
  const user = await requireVerifiedUser();
  if (!isPremiumPlan(user.plan)) return <AppShell><PageHeader title="年間整理レポート" description="年間の仕事利用分と証憑整理状況を確認します。" /><PremiumOnlyNotice title="年間整理レポートはPremium限定です" description="支払い時点の仕事利用割合、カテゴリ別内訳、科目・証憑の整理状況を年間単位で確認できます。" /></AppShell>;
  const referenceDate = new Date();
  const histories = (await prisma.paymentHistory.findMany({
    where: { userId: user.id, paidAt: { lte: referenceDate } },
    include: { subscription: true },
    orderBy: { paidAt: "asc" },
  })) as unknown as PaymentHistoryView[];
  const currentYear = resolvePaymentTrendYear(undefined, referenceDate);
  const selectedYear = resolvePaymentTrendYear(year, referenceDate);
  const report = buildAnnualBusinessReport(histories, selectedYear);
  const reportYears = [...new Set([
    currentYear,
    ...histories.map((item) => japanCalendarDate(item.paidAt).getUTCFullYear()),
  ])].sort((left, right) => right - left);
  const maxMonthlyAmount = Math.max(...report.months.map((month) => month.paidAmount), 1);

  return (
    <AppShell>
      <PageHeader
        title={`${selectedYear}年 年間整理レポート`}
        description="継続課金の支払い実績を、仕事利用分と証憑整理状況まで含めて年間単位で確認します。"
        action={
          <div className="flex flex-wrap gap-2 print-hidden">
            <a href={`/api/export/payments?year=${selectedYear}`} className="btn-secondary">支払実績CSV</a>
            <PrintPageButton subject="年間整理レポート" />
            <Link href={`/payment-totals?year=${selectedYear}`} className="btn-primary">前年差を見る</Link>
          </div>
        }
      />
      <nav className="print-hidden mb-6 flex flex-wrap gap-2 border-y border-slate-200 bg-white/80 px-3 py-3" aria-label="年間整理レポートの対象年">
        {reportYears.map((optionYear) => (
          <Link
            key={optionYear}
            href={`/annual-report?year=${optionYear}`}
            aria-current={optionYear === selectedYear ? "page" : undefined}
            className={optionYear === selectedYear ? "btn-primary min-h-0 px-4 py-2 text-sm" : "btn-secondary min-h-0 px-4 py-2 text-sm"}
          >
            {optionYear}年
          </Link>
        ))}
      </nav>

      <Card className="border-blue-100 bg-white/92">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black text-blue-700">ANNUAL ORGANIZATION</p>
            <h2 className="mt-2 text-xl font-black text-slate-950">支払い時点の記録による年間集計</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600">後から契約設定を変更しても、過去の仕事利用割合・カテゴリ・支払い額は変わりません。</p>
          </div>
          <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-sm font-black text-slate-700">支払い {report.paymentCount}件</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["年間支払い", yen.format(report.totalPaid)],
            ["仕事利用分（見積）", yen.format(report.businessPaid)],
            ["個人利用分", yen.format(report.personalPaid)],
            ["科目・証憑の整理率", report.paymentCount === 0 ? "-" : `${report.organization.completionPercent}%`],
          ].map(([label, value]) => (
            <div key={label} className="border-y border-slate-100 py-3">
              <p className="text-xs font-bold text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${selectedYear}年の科目・証憑整理率`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={report.organization.completionPercent}>
          <div className="h-full rounded-full bg-cyan-600" style={{ width: `${report.organization.completionPercent}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-slate-600">
          <span>整理済み {report.organization.organizedCount}件</span>
          <span>科目設定済み {report.organization.labeledCount}件</span>
          <span>証憑あり {report.organization.evidencedCount}件</span>
          <span className={report.organization.missingCount > 0 ? "text-red-700" : "text-emerald-700"}>未整理 {report.organization.missingCount}件</span>
        </div>
        {report.organization.missingCount > 0 && <Link href={`/payments?year=${selectedYear}&organization=missing#payment-history-list`} className="print-hidden mt-4 inline-flex text-sm font-black text-blue-700 hover:text-blue-900">未整理{report.organization.missingCount}件を修正する</Link>}
      </Card>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="min-w-0">
          <h2 className="text-lg font-black text-slate-950">月別の仕事利用分</h2>
          <p className="mt-1 text-sm text-slate-500">総支払額のうち、支払い時点の仕事利用割合に基づく見積もりです。</p>
          {report.paymentCount === 0 ? <div className="mt-5"><EmptyState text="この年の支払い履歴がありません。" /></div> : (
            <div className="mt-5 flex h-64 items-end gap-2 overflow-x-auto border-b border-slate-200 pb-3" role="img" aria-label={`${selectedYear}年の月別支払い額と仕事利用分`}>
              {report.months.map((month) => (
                <div key={month.month} className="flex min-w-12 flex-1 flex-col items-center gap-2">
                  <div className="flex h-44 w-full items-end justify-center gap-1 rounded-md bg-slate-50 px-1">
                    <div className="w-2/5 rounded-t bg-slate-300" style={{ height: `${Math.max(month.paidAmount > 0 ? 4 : 0, Math.round(month.paidAmount / maxMonthlyAmount * 100))}%` }} title={`${month.month}月 支払い ${yen.format(month.paidAmount)}`} />
                    <div className="w-2/5 rounded-t bg-cyan-600" style={{ height: `${Math.max(month.businessAmount > 0 ? 4 : 0, Math.round(month.businessAmount / maxMonthlyAmount * 100))}%` }} title={`${month.month}月 仕事利用分 ${yen.format(month.businessAmount)}`} />
                  </div>
                  <p className="text-xs font-black text-slate-600">{month.month}月</p>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-5 text-xs font-bold text-slate-600">
            <span className="inline-flex items-center gap-2"><span className="size-3 rounded-sm bg-slate-300" />支払い総額</span>
            <span className="inline-flex items-center gap-2"><span className="size-3 rounded-sm bg-cyan-600" />仕事利用分</span>
          </div>
        </Card>

        <Card className="min-w-0">
          <h2 className="text-lg font-black text-slate-950">カテゴリ別内訳</h2>
          <p className="mt-1 text-sm text-slate-500">カテゴリも支払いを記録した時点の値です。</p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="px-3 py-3 text-left font-bold text-slate-600">カテゴリ</th>
                  <th className="px-3 py-3 text-right font-bold text-slate-600">支払い</th>
                  <th className="px-3 py-3 text-right font-bold text-slate-600">仕事分</th>
                  <th className="px-3 py-3 text-right font-bold text-slate-600">未整理</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.categories.length === 0 ? <tr><td colSpan={4} className="px-3 py-5 text-center text-slate-500">集計対象がありません。</td></tr> : report.categories.map((category) => (
                  <tr key={category.name}>
                    <td className="px-3 py-3"><p className="font-black text-slate-950">{category.name}</p><p className="mt-1 text-xs text-slate-500">{category.paymentCount}件 / {category.sharePercent}%</p></td>
                    <td className="px-3 py-3 text-right font-black">{yen.format(category.paidAmount)}</td>
                    <td className="px-3 py-3 text-right font-bold text-cyan-800">{yen.format(category.businessAmount)}</td>
                    <td className={`px-3 py-3 text-right font-black ${category.missingCount > 0 ? "text-red-700" : "text-emerald-700"}`}>{category.missingCount}件</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <p className="mt-6 text-xs font-semibold leading-5 text-slate-500">仕事利用分は利用者が記録した割合に基づく整理用の見積もりで、税務上の必要経費を確定するものではありません。CSVまたは印刷/PDFで共有し、最終判断は利用者または税務の専門家が行ってください。</p>
    </AppShell>
  );
}

export async function PaymentTotalsView({ year }: { year?: string } = {}) {
  const user = await requireVerifiedUser();
  if (!isPremiumPlan(user.plan)) return <AppShell><PageHeader title="支払い累計" description="全期間の支払い累計を確認します。" /><PremiumOnlyNotice title="支払い累計はPremium限定です" description="月別累計グラフ、支払い方法別集計、サブスク別ランキングはPremiumで利用できます。" /></AppShell>;
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const histories = (await prisma.paymentHistory.findMany({
    where: { userId: user.id, paidAt: { lte: todayEnd } },
    include: { subscription: true },
    orderBy: { paidAt: "asc" },
  })) as unknown as PaymentHistoryView[];
  const currentTrendYear = resolvePaymentTrendYear(undefined, todayEnd);
  const selectedYear = resolvePaymentTrendYear(year, todayEnd);
  const yearComparison = buildPaymentYearComparison(histories, selectedYear, todayEnd);

  const totalPaid = histories.reduce((sum, item) => sum + item.amount, 0);
  const totalBusinessUse = histories.reduce(
    (sum, item) => sum + businessUseAmount(item.amount, item.businessUsePercent),
    0,
  );
  const exportYears = [...new Set(histories.map((item) => japanCalendarDate(item.paidAt).getUTCFullYear()))].sort((a, b) => b - a);
  const comparisonYears = [...new Set([currentTrendYear, ...exportYears])].sort((a, b) => b - a);
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
    const name = item.categoryNameSnapshot ?? "未分類";
    acc[name] = acc[name] ?? { total: 0, count: 0 };
    acc[name].total += item.amount;
    acc[name].count += 1;
    return acc;
  }, {});
  const methodTotals = histories.reduce<Record<string, { total: number; count: number }>>((acc, item) => {
    const name = item.paymentMethodNameSnapshot ?? "未設定";
    acc[name] = acc[name] ?? { total: 0, count: 0 };
    acc[name].total += item.amount;
    acc[name].count += 1;
    return acc;
  }, {});
  const subscriptionTotals = histories.reduce<Record<string, { total: number; count: number; category: string }>>((acc, item) => {
    const name = item.subscriptionNameSnapshot;
    acc[name] = acc[name] ?? { total: 0, count: 0, category: item.categoryNameSnapshot ?? "未分類" };
    acc[name].total += item.amount;
    acc[name].count += 1;
    return acc;
  }, {});

  const categoryEntries = Object.entries(categoryTotals).sort((a, b) => b[1].total - a[1].total);
  const methodEntries = Object.entries(methodTotals).sort((a, b) => b[1].total - a[1].total);
  const ranking = Object.entries(subscriptionTotals).sort((a, b) => b[1].total - a[1].total).slice(0, 10);
  const recentHistories = [...histories].sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime()).slice(0, 12);
  const yearComparisonMaxMonthly = Math.max(
    ...yearComparison.months.flatMap((month) => [month.currentAmount, month.previousAmount]),
    1,
  );

  return (
    <AppShell>
      <PageHeader
        title="支払い累計"
        description="これまでに記録した支払いの累計、月別推移、カテゴリ別・支払い方法別の構成を確認します。"
        action={<div className="flex flex-wrap gap-2"><Link href={`/annual-report?year=${selectedYear}`} className="btn-secondary">年間整理レポート</Link><Link href="/payments" className="btn-primary">支払いを記録</Link></div>}
      />

      <Card className="mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">PAYMENT REPORT</p>
            <h2 className="mt-3 text-xl font-black text-slate-950">支払い履歴を累計レポート化</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600">支払い確認で記録したデータをもとに、固定費の実績推移を見える化します。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(exportYears.length ? exportYears : [new Date().getFullYear()]).map((year) => (
              <a key={year} href={`/api/export/payments?year=${year}`} className="btn-secondary">
                {year}年 支払実績CSV
              </a>
            ))}
          </div>
        </div>
        <p className="mt-4 text-xs font-semibold leading-5 text-slate-500">仕事利用分は、支払いを記録した時点の設定割合による整理用の見積もりです。税務上の必要経費を確定するものではありません。</p>
      </Card>

      <Card className="mb-6 border-blue-100 bg-white/92">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-black text-blue-700">YEAR OVER YEAR</p>
            <h2 className="mt-2 text-xl font-black text-slate-950">{selectedYear}年の支出を前年同期間と比較</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
              1月から{yearComparison.comparableMonthCount}月までの支払い実績を、{yearComparison.previousYear}年の同じ期間と比較します。
            </p>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="比較する年">
            {comparisonYears.map((optionYear) => (
              <Link
                key={optionYear}
                href={`/payment-totals?year=${optionYear}`}
                aria-current={optionYear === selectedYear ? "page" : undefined}
                className={optionYear === selectedYear ? "btn-primary min-h-0 px-4 py-2 text-sm" : "btn-secondary min-h-0 px-4 py-2 text-sm"}
              >
                {optionYear}年
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [`${selectedYear}年 同期間`, yen.format(yearComparison.currentAmount)],
            [`${yearComparison.previousYear}年 同期間`, yen.format(yearComparison.previousAmount)],
            ["前年差", `${yearComparison.difference >= 0 ? "+" : ""}${yen.format(yearComparison.difference)}`],
            [selectedYear === currentTrendYear ? "年間着地見込み" : "年間実績", yen.format(yearComparison.annualProjection)],
          ].map(([label, value], index) => (
            <div key={label} className="border-y border-slate-100 py-3">
              <p className="text-xs font-bold text-slate-500">{label}</p>
              <p className={`mt-1 text-xl font-black ${index === 2 ? yearComparison.difference > 0 ? "text-red-600" : yearComparison.difference < 0 ? "text-emerald-700" : "text-slate-950" : "text-slate-950"}`}>{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold text-slate-600">
          <span className="inline-flex items-center gap-2"><span className="size-3 rounded-sm bg-blue-600" />{selectedYear}年</span>
          <span className="inline-flex items-center gap-2"><span className="size-3 rounded-sm bg-slate-300" />{yearComparison.previousYear}年</span>
          <span>増減率 {yearComparison.changePercent === null ? "比較不可" : `${yearComparison.changePercent >= 0 ? "+" : ""}${yearComparison.changePercent}%`}</span>
        </div>
        {yearComparison.currentAmount === 0 && yearComparison.previousAmount === 0 ? (
          <div className="mt-5"><EmptyState text="比較できる支払い履歴がありません。" /></div>
        ) : (
          <div className="mt-5 flex h-72 items-end gap-3 overflow-x-auto border-b border-slate-200 pb-3">
            {yearComparison.months.filter((item) => item.month <= yearComparison.comparableMonthCount).map((item) => (
              <div key={item.month} className="flex min-w-16 flex-1 flex-col items-center gap-2">
                <div className="flex h-52 w-full items-end justify-center gap-1">
                  <div className="w-2/5 rounded-t bg-slate-300" style={{ height: `${Math.max(item.previousAmount > 0 ? 4 : 0, Math.round((item.previousAmount / yearComparisonMaxMonthly) * 100))}%` }} title={`${yearComparison.previousYear}年${item.month}月 ${yen.format(item.previousAmount)}`} />
                  <div className="w-2/5 rounded-t bg-blue-600" style={{ height: `${Math.max(item.currentAmount > 0 ? 4 : 0, Math.round((item.currentAmount / yearComparisonMaxMonthly) * 100))}%` }} title={`${selectedYear}年${item.month}月 ${yen.format(item.currentAmount)}`} />
                </div>
                <p className="text-xs font-black text-slate-600">{item.month}月</p>
              </div>
            ))}
          </div>
        )}
        {selectedYear === currentTrendYear && (
          <p className="mt-4 text-xs font-semibold leading-5 text-slate-500">年間着地見込みは現在までの月平均を12か月へ延長した参考値です。未来の契約変更や年払い時期は反映しません。</p>
        )}
        <p className="mt-2 text-xs font-semibold leading-5 text-amber-800">
          この比較は登録済みの支払い履歴が根拠です。未記録の支払いも減少として見えるため、削減実績を確定する前に
          <Link href="/monthly-report" className="ml-1 underline decoration-2 underline-offset-2 hover:text-amber-950">月次レポートで請求突合を確認</Link>
          してください。
        </p>
      </Card>

      <div className="mb-6 grid gap-5 xl:grid-cols-2">
        {[
          { title: "支出が増えた主な要因", items: yearComparison.increases, tone: "red" },
          { title: "支出が減った主な要因", items: yearComparison.decreases, tone: "emerald" },
        ].map((group) => (
          <Card key={group.title}>
            <h2 className="text-lg font-black text-slate-950">{group.title}</h2>
            <p className="mt-1 text-sm text-slate-500">前年同期間との差額が大きい順です。</p>
            <div className="mt-4 divide-y divide-slate-100">
              {group.items.length === 0 ? <EmptyState text="該当する増減要因はありません。" /> : group.items.map((driver) => (
                <div key={driver.name} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-slate-950">{driver.name}</p>
                      <span className={`rounded-full px-2 py-1 text-xs font-black ${group.tone === "red" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{paymentTrendDriverLabel(driver.kind)}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{driver.category} / {yearComparison.previousYear}年 {yen.format(driver.previousAmount)} → {selectedYear}年 {yen.format(driver.currentAmount)}</p>
                  </div>
                  <p className={`shrink-0 font-black ${driver.difference > 0 ? "text-red-600" : "text-emerald-700"}`}>{driver.difference > 0 ? "+" : ""}{yen.format(driver.difference)}</p>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {[
          ["累計支払い", yen.format(totalPaid)],
          ["仕事利用分（見積）", yen.format(totalBusinessUse)],
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
                  <p className="font-bold">{history.subscriptionNameSnapshot}</p>
                  <p className="mt-1 text-sm text-slate-500">{dateText(history.paidAt)} / {history.paymentMethodNameSnapshot ?? "未設定"}</p>
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

  const [allSubscriptions, paymentHistories] = await Promise.all([
    prisma.subscription.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
        status: "ACTIVE",
      },
      include: { category: true, paymentMethod: true },
      orderBy: [{ nextBillingDate: "asc" }, { name: "asc" }],
    }),
    prisma.paymentHistory.findMany({
      where: {
        userId: user.id,
        paidAt: {
          gte: shiftCalendarDays(
            monthStart,
            -BILLING_RECONCILIATION_MATCH_WINDOW_DAYS,
          ),
          lt: shiftCalendarDays(
            monthEnd,
            BILLING_RECONCILIATION_MATCH_WINDOW_DAYS,
          ),
        },
      },
      select: { id: true, subscriptionId: true, amount: true, paidAt: true },
      orderBy: { paidAt: "asc" },
    }),
  ]);
  const subscriptions = limitByPlan(
    allSubscriptions as unknown as SubscriptionView[],
    user.plan,
  );
  const hiddenCount = hiddenByPlan(allSubscriptions.length, user.plan);
  const subscriptionById = new Map(subscriptions.map((item) => [item.id, item]));
  const reconciliation = reconcileBillingPeriod({
    subscriptions,
    payments: paymentHistories,
    rangeStart: monthStart,
    rangeEnd: monthEnd,
  });
  const calendarItems = reconciliation.items.flatMap((item) => {
    const subscription = subscriptionById.get(item.subscriptionId);
    return subscription ? [{ ...item, subscription }] : [];
  });

  const byDate = calendarItems.reduce<Record<string, typeof calendarItems>>((acc, item) => {
    const key = dateKey(item.occurrenceAt);
    acc[key] = acc[key] ? [...acc[key], item] : [item];
    return acc;
  }, {});

  return (
    <AppShell>
      <PageHeader
        title="更新日カレンダー"
        description="月ごとのカレンダーで、更新日に該当するサブスクリプションを確認します。"
        action={
          <div className="flex flex-wrap gap-2">
            {isPremiumPlan(user.plan)
              ? <a href="/api/export/calendar" className="btn-secondary" download>カレンダーへ書き出す</a>
              : <Link href="/billing" className="btn-secondary">Premiumでカレンダー連携</Link>}
            <Link href="/subscriptions/new" className="btn-primary">サブスク追加</Link>
          </div>
        }
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
              <div key={`${index}-${day ?? "blank"}`} className={`min-h-20 border-b border-r border-slate-100 p-1 sm:min-h-36 sm:p-2 ${day ? "bg-white/88" : "bg-slate-50/70"} ${isToday ? "ring-2 ring-inset ring-blue-500" : ""}`}>
                {day && (
                  <>
                    <div className="flex flex-col items-center gap-1 sm:flex-row sm:justify-between sm:gap-0">
                      <span className={`grid size-6 place-items-center rounded-full text-xs font-bold sm:size-7 sm:text-sm ${isToday ? "bg-blue-600 text-white" : "text-slate-700"}`}>{day}</span>
                      {items.length > 0 && <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 sm:px-2 sm:py-1 sm:text-xs">{items.length}件</span>}
                    </div>
                    <div className="mt-2 hidden space-y-2 sm:block">
                      {items.map((item) => (
                        <Link key={item.id} href={`/subscriptions/${item.subscriptionId}`} className="block rounded-md border border-slate-100 bg-slate-50/90 p-2 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50">
                          <p className="truncate text-xs font-bold text-slate-900">{item.subscriptionName}</p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-600">請求予定 {yen.format(item.expectedAmount)}</p>
                          <span className={`mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-black ${reconciliationStatusClass(item.status)}`}>
                            {reconciliationStatusLabel(item.status)}
                          </span>
                          <p className="mt-1 truncate text-[11px] text-slate-500">{item.subscription.category?.name ?? "未分類"}</p>
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {calendarItems.length === 0 && <div className="mt-5"><EmptyState text="この月に更新予定のサブスクリプションはありません。" /></div>}
        {calendarItems.length > 0 && (
          <div className="mt-5 space-y-3 sm:hidden">
            <h3 className="text-sm font-black text-slate-800">この月の請求予定</h3>
            {calendarItems.map((item) => (
              <Link key={`mobile-${item.id}`} href={`/subscriptions/${item.subscriptionId}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-500">{dateText(item.occurrenceAt)}</p>
                  <p className="mt-1 truncate font-bold text-slate-950">{item.subscriptionName}</p>
                  <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-black ${reconciliationStatusClass(item.status)}`}>
                    {reconciliationStatusLabel(item.status)}
                  </span>
                </div>
                <p className="shrink-0 text-sm font-black text-slate-950">{yen.format(item.expectedAmount)}</p>
              </Link>
            ))}
          </div>
        )}
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
  const analysisReferenceDate = new Date();
  const activeWithUpcomingBilling = active.map((item) => ({
    ...item,
    nextBillingDate: nextBillingOccurrence(item.nextBillingDate, item.billingCycle, item.customCycleDays, analysisReferenceDate),
  }));
  const monthlyTotal = active.reduce((sum, item) => sum + monthly(item.price, item.billingCycle, item.customCycleDays), 0);
  const annualTotal = monthlyTotal * MONTHS_PER_YEAR;
  const businessMonthlyTotal = active.reduce(
    (sum, item) => sum + businessUseAmount(monthly(item.price, item.billingCycle, item.customCycleDays), item.businessUsePercent),
    0,
  );
  const businessAnnualTotal = businessMonthlyTotal * MONTHS_PER_YEAR;
  const upcoming30 = activeWithUpcomingBilling.filter((item) => isUpcomingWithin(item.nextBillingDate, 30));
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
        <Card><p className="text-sm font-semibold text-slate-500">仕事利用分</p><p className="mt-2 text-3xl font-black">{yen.format(businessMonthlyTotal)}</p><p className="mt-2 text-sm text-slate-500">年間見込み {yen.format(businessAnnualTotal)}</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">30日以内の更新</p><p className="mt-2 text-3xl font-black">{upcoming30.length}件</p><p className="mt-2 text-sm text-slate-500">未見直し {reviewCount}件</p></Card>
      </div>
      <p className="mt-3 text-xs font-medium leading-5 text-slate-500">
        仕事利用分は、各契約に入力した利用割合に基づく整理用の見積もりです。税務上の必要経費を確定するものではありません。
      </p>

      <GeminiAnalysisPanel configured={Boolean(env.geminiApiKey)} />

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
  if (plan === "LIFETIME") return "Premium";
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

export async function SubscriptionSimulationView() {
  const user = await requireVerifiedUser();
  if (!isPremiumPlan(user.plan)) {
    return <AppShell><PageHeader title="入替シミュレーター" description="契約を残す・外す場合の費用を、実データを変えずに比較します。" /><PremiumOnlyNotice title="入替シミュレーターはPremium限定です" description="複数の契約を比較し、月額・年間の削減見込みを確認できます。" /></AppShell>;
  }

  const subscriptions = (await prisma.subscription.findMany({
    where: { userId: user.id, deletedAt: null, status: "ACTIVE" },
    include: { category: true },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  })) as unknown as SubscriptionView[];

  return (
    <AppShell>
      <PageHeader title="入替シミュレーター" description="残す契約にチェックを入れて、外す場合の費用を比較します。実データは変更されません。" />
      <Card><SubscriptionSimulator subscriptions={subscriptions.map((subscription) => ({ id: subscription.id, name: subscription.name, monthlyCost: monthly(subscription.price, subscription.billingCycle, subscription.customCycleDays), categoryName: subscription.category?.name ?? null }))} /></Card>
    </AppShell>
  );
}

export async function ReviewView() {
  const user = await requireVerifiedUser();
  if (!isPremiumPlan(user.plan)) return <AppShell><PageHeader title="見直しレポート" description="削減見込み、見直しスコア、期限リスクをまとめて判断します。" /><PremiumOnlyNotice title="見直しレポートはPremium限定です" description="削減見込み、見直しスコア、期限リスク、優先順位つきの改善リストはPremiumで利用できます。" /></AppShell>;
  const usageStart = buildUsagePeriods().find((period) => period.key === "days365")?.start;
  const reviewReferenceDate = new Date();
  const decisionPeriod = renewalDecisionPeriod(reviewReferenceDate);
  const [subscriptions, usageRecords, completedSubscriptions, currentDecisions, decisionHistory] = (await Promise.all([
    prisma.subscription.findMany({
    where: { userId: user.id, deletedAt: null, status: "ACTIVE" },
    include: { category: true, paymentMethod: true },
    orderBy: { nextBillingDate: "asc" },
    }),
    prisma.subscriptionUsage.findMany({
      where: { userId: user.id, ...(usageStart ? { usedDate: { gte: usageStart } } : {}) },
      select: { subscriptionId: true, usedDate: true },
    }),
    prisma.subscription.findMany({
      where: { userId: user.id, cancellationStatus: "COMPLETED", cancellationCompletedAt: { not: null } },
      select: { id: true, name: true, price: true, billingCycle: true, customCycleDays: true, cancellationCompletedAt: true },
      orderBy: { cancellationCompletedAt: "desc" },
    }),
    prisma.savingChallenge.findMany({
      where: { userId: user.id, year: decisionPeriod.year, month: decisionPeriod.month },
      orderBy: { decidedAt: "desc" },
    }),
    prisma.savingChallenge.findMany({
      where: { userId: user.id },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: RENEWAL_DECISION_HISTORY_LIMIT,
    }),
  ])) as unknown as [
    SubscriptionView[],
    SubscriptionUsageView[],
    Array<{ id: string; name: string; price: number; billingCycle: string; customCycleDays: number | null; cancellationCompletedAt: Date | null }>,
    SavingChallengeView[],
    SavingChallengeView[],
  ];
  const challengeSubscriptionIds = [...new Set(decisionHistory.map((decision) => decision.subscriptionId))];
  const challengeSubscriptions = challengeSubscriptionIds.length > 0
    ? await prisma.subscription.findMany({
        where: { userId: user.id, id: { in: challengeSubscriptionIds } },
        select: { id: true, name: true },
      })
    : [];
  const challengeSubscriptionNames = new Map(challengeSubscriptions.map((subscription) => [subscription.id, subscription.name]));
  const currentDecisionBySubscription = new Map(
    currentDecisions.map((decision) => [decision.subscriptionId, decision]),
  );
  const currentYear = japanCalendarDate().getUTCFullYear();
  const completedSavings = summarizeCompletedSavings(completedSubscriptions, currentYear);
  const completedSavingsTimeline = buildCompletedSavingsTimeline(
    completedSubscriptions,
    reviewReferenceDate,
  );
  const usageBySubscription = usageDatesBySubscription(usageRecords);
  const subscriptionsWithUpcomingBilling = subscriptions.map((item) => ({
    ...item,
    nextBillingDate: nextBillingOccurrence(item.nextBillingDate, item.billingCycle, item.customCycleDays, reviewReferenceDate),
  }));
  const renewalQueue = subscriptionsWithUpcomingBilling.filter((item) =>
    isRenewalDecisionDue(item.nextBillingDate, reviewReferenceDate),
  ).sort((left, right) => left.nextBillingDate.getTime() - right.nextBillingDate.getTime());
  const pendingDecisionCount = renewalQueue.filter(
    (item) => !currentDecisionBySubscription.has(item.id),
  ).length;
  const categoryCounts = subscriptions.reduce<Record<string, number>>((acc, item) => {
    const key = item.categoryId ?? "none";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const scored = subscriptionsWithUpcomingBilling
    .map((item) => {
      const score = reviewScore(item, categoryCounts[item.categoryId ?? "none"] ?? 1);
      const saving = estimatedMonthlySaving(item);
      return { item, score, saving };
    })
    .sort((a, b) => b.score.score - a.score.score || b.saving - a.saving);
  const totalSaving = scored.reduce((sum, item) => sum + item.saving, 0);
  const urgentCount = scored.filter((item) => item.score.score >= REVIEW_URGENT_SCORE_THRESHOLD).length;
  const expensive = [...subscriptions].sort((a, b) => monthly(b.price, b.billingCycle, b.customCycleDays) - monthly(a.price, a.billingCycle, a.customCycleDays)).slice(0, 5);
  const urgent = subscriptionsWithUpcomingBilling.filter((item) => isUpcomingWithin(item.nextBillingDate, UPCOMING_DEADLINE_DAYS) || (item.trialEndsAt && isUpcomingWithin(item.trialEndsAt, UPCOMING_DEADLINE_DAYS)) || (item.cancellationDeadline && isUpcomingWithin(item.cancellationDeadline, UPCOMING_DEADLINE_DAYS)));
  const stale = subscriptions.filter((item) => needsReview(item.lastReviewedAt));
  const duplicateCategoryIds = new Set(
    Object.entries(categoryCounts)
      .filter(([categoryId, count]) => categoryId !== "none" && count > 1)
      .map(([categoryId]) => categoryId),
  );
  const unusedDaysBySubscription = new Map(subscriptions.map((item) => {
    const usedDates = usageBySubscription.get(item.id) ?? [];
    const counts = countUsageByPeriod(usedDates);
    const unusedDays = usedDates.length === 0 ? 0 : counts.days90 === 0 ? 90 : counts.days30 === 0 ? 30 : 0;
    return [item.id, unusedDays] as const;
  }));
  const highCostThreshold = expensive[0] ? monthly(expensive[0].price, expensive[0].billingCycle, expensive[0].customCycleDays) : 0;
  const candidates = detectCancellationCandidates(subscriptions.map((item) => ({
    id: item.id,
    name: item.name,
    monthlyCost: monthly(item.price, item.billingCycle, item.customCycleDays),
    unusedDays: unusedDaysBySubscription.get(item.id) ?? 0,
    usageFrequency: item.usageFrequency,
    priority: item.priority,
    duplicateCategory: duplicateCategoryIds.has(item.categoryId ?? "none"),
    isHighCost: highCostThreshold > 0 && monthly(item.price, item.billingCycle, item.customCycleDays) === highCostThreshold,
  })), MONTHS_PER_YEAR);
  const candidateMonthlySaving = candidates.reduce((total, candidate) => total + candidate.estimatedMonthlySaving, 0);
  const candidateAnnualSaving = candidates.reduce((total, candidate) => total + candidate.annualSaving, 0);
  const candidateSavingsBySubscription = new Map(
    candidates.map((candidate) => [candidate.id, candidate.estimatedMonthlySaving]),
  );
  const reviewOutcome = buildReviewOutcomePipeline(
    subscriptionsWithUpcomingBilling.map((item) => ({
      id: item.id,
      name: item.name,
      monthlyCost: monthly(item.price, item.billingCycle, item.customCycleDays),
      candidateMonthlySaving: candidateSavingsBySubscription.get(item.id) ?? 0,
      isCandidate: candidateSavingsBySubscription.has(item.id),
      cancellationStatus: item.cancellationStatus,
      plannedCancelAt: item.plannedCancelAt,
      updatedAt: item.updatedAt,
    })),
    currentDecisions.flatMap((decision) => {
      const status = renewalDecisionStatus(decision.status);
      return status ? [{
        subscriptionId: decision.subscriptionId,
        status,
        potentialMonthlySaving: decision.potentialMonthlySaving,
        decidedAt: decision.decidedAt,
      }] : [];
    }),
    completedSubscriptions.flatMap((item) => item.cancellationCompletedAt ? [{
      id: item.id,
      name: item.name,
      monthlyCost: monthly(item.price, item.billingCycle, item.customCycleDays),
      cancellationCompletedAt: item.cancellationCompletedAt,
    }] : []),
    reviewReferenceDate,
  );
  const outcomeStageTone: Record<ReviewOutcomeStage, string> = {
    CANDIDATE: "text-amber-700",
    DECIDED: "text-blue-700",
    IN_PROGRESS: "text-fuchsia-700",
    REALIZED: "text-emerald-700",
  };

  return (
    <AppShell>
      <PageHeader title="見直しレポート" description="削減見込み、見直しスコア、期限リスクをまとめて判断します。" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card><p className="text-sm font-semibold text-slate-500">確度補正後の削減試算</p><p className="mt-2 text-3xl font-black">{yen.format(totalSaving)}</p><p className="mt-2 text-sm text-slate-500">年間 {yen.format(totalSaving * MONTHS_PER_YEAR)}</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">根拠スコアによる試算</p><p className="mt-2 text-3xl font-black">{yen.format(candidateMonthlySaving)}</p><p className="mt-2 text-sm text-slate-500">年間 {yen.format(candidateAnnualSaving)}</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">要対応スコア</p><p className="mt-2 text-3xl font-black">{urgentCount}件</p><p className="mt-2 text-sm text-slate-500">70点以上</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">14日以内の対応</p><p className="mt-2 text-3xl font-black">{urgent.length}件</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">未見直し</p><p className="mt-2 text-3xl font-black">{stale.length}件</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">更新判断待ち</p><p className="mt-2 text-3xl font-black">{pendingDecisionCount}件</p><p className="mt-2 text-sm text-slate-500">{RENEWAL_DECISION_WINDOW_DAYS}日以内の更新</p></Card>
      </div>
      <Card className="mt-6 overflow-hidden p-0">
        <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">見直し成果パイプライン</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">候補を見つけてから解約完了による削減実績になるまでを、重複せず追跡します。</p>
            </div>
            <p className={`text-sm font-black ${reviewOutcome.attentionCount > 0 ? "text-red-700" : "text-emerald-700"}`}>
              {reviewOutcome.attentionCount > 0 ? `停滞・期限超過 ${reviewOutcome.attentionCount}件` : "停滞・期限超過なし"}
            </p>
          </div>
        </div>
        <div className="grid divide-y divide-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          {reviewOutcome.stages.map((stage, index) => (
            <div key={stage.stage} className="min-w-0 px-5 py-5 sm:px-6">
              <div className="flex items-center justify-between gap-3">
                <p className={`font-black ${outcomeStageTone[stage.stage]}`}>{index + 1}. {stage.label}</p>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">{stage.count}件</span>
              </div>
              <p className="mt-3 text-2xl font-black text-slate-950">{yen.format(stage.monthlyAmount)}<span className="ml-1 text-xs font-bold text-slate-500">/月</span></p>
              <p className="mt-2 text-xs font-medium leading-5 text-slate-500">{stage.description}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-200 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="font-black text-slate-950">次に進める契約</h3>
            <p className="text-xs font-medium text-slate-500">見込み額と実現額は別々に表示しています</p>
          </div>
          <div className="mt-3 divide-y divide-slate-100">
            {reviewOutcome.items.filter((item) => item.stage !== "REALIZED").length === 0 ? (
              <EmptyState text="現在、次の対応が必要な見直し案件はありません。" />
            ) : reviewOutcome.items.filter((item) => item.stage !== "REALIZED").slice(0, 8).map((item) => (
              <Link key={`${item.stage}-${item.id}`} href={`/subscriptions/${item.id}`} className="grid gap-2 py-4 transition hover:bg-blue-50/60 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-black text-slate-950">{item.name}</p>
                    <span className={`text-xs font-black ${outcomeStageTone[item.stage]}`}>{item.statusLabel}</span>
                    {item.attentionReason && <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-black text-red-700">{item.attentionReason}</span>}
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-600">次の行動: {item.nextAction}</p>
                </div>
                <p className="text-sm font-black text-slate-800">{item.monthlyAmount > 0 ? `${yen.format(item.monthlyAmount)}/月` : "削減見込みなし"}</p>
              </Link>
            ))}
          </div>
        </div>
      </Card>
      <Card className="mt-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-black text-blue-700">RENEWAL INBOX</p>
            <h2 className="mt-2 text-lg font-bold">今月の更新判断</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{RENEWAL_DECISION_WINDOW_DAYS}日以内に更新される契約について、継続理由・再検討条件・解約検討を記録します。保存しても契約状態は変わりません。</p>
          </div>
          <p className="text-sm font-bold text-slate-500">判断待ち {pendingDecisionCount} / 対象 {renewalQueue.length}件</p>
        </div>
        <div className="mt-5 space-y-4">
          {renewalQueue.length === 0 ? <EmptyState text="30日以内に更新判断が必要な契約はありません。" /> : renewalQueue.map((item) => {
            const currentDecision = currentDecisionBySubscription.get(item.id);
            return (
              <details key={item.id} className="group rounded-lg border border-slate-200 bg-white/80 p-4 open:border-blue-200 open:bg-blue-50/40">
                <summary className="cursor-pointer font-semibold text-slate-800 marker:text-blue-600">
                  <span className="ml-2 inline-flex w-[calc(100%_-_2rem)] flex-col gap-2 align-middle sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span className="font-black text-slate-950">{item.name}</span>
                    <p className="mt-1 text-sm text-slate-500">月額換算 {yen.format(monthly(item.price, item.billingCycle, item.customCycleDays))}</p>
                  </div>
                  <span className="text-sm font-bold text-slate-600">更新 {isoDate(item.nextBillingDate)}{currentDecision ? " / 判断済み" : " / 未判断"}</span>
                  </span>
                </summary>
                <div className="mt-4 border-t border-blue-100 pt-4">
                  <RenewalDecisionForm
                    subscriptionId={item.id}
                    renewalDate={item.nextBillingDate}
                    currentStatus={renewalDecisionStatus(currentDecision?.status)}
                    currentReason={currentDecision?.reason ?? ""}
                  />
                  <Link href={`/subscriptions/${item.id}`} className="mt-3 inline-block text-sm font-bold text-blue-700">契約詳細を見る</Link>
                </div>
              </details>
            );
          })}
        </div>
      </Card>
      <Card className="mt-6">
        <h2 className="text-lg font-bold">解約候補</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">自動解約は行いません。理由を確認して、詳細画面の解約支援でご自身で判断してください。</p>
        <div className="mt-4 space-y-3">
          {candidates.length === 0 ? <EmptyState text="現在、解約候補はありません。" /> : candidates.map((candidate) => (
            <Link key={candidate.id} href={`/subscriptions/${candidate.id}`} className="grid gap-3 rounded-lg border border-slate-100 bg-white/70 p-4 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 lg:grid-cols-[1fr_auto] lg:items-center">
              <div><p className="font-bold">{candidate.name}</p><p className="mt-1 text-sm leading-6 text-slate-500">{candidate.reasons.join(" / ")}</p></div>
              <div className="text-left lg:text-right"><p className="font-black">契約額 {yen.format(candidate.monthlyCost)}/月</p><p className="mt-1 text-sm font-semibold text-emerald-700">確度 {candidate.confidencePercent}% / 年間試算 {yen.format(candidate.annualSaving)}</p></div>
            </Link>
          ))}
        </div>
      </Card>
      <Card className="mt-6 border-emerald-100 bg-white/92">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black text-emerald-700">REALIZED SAVINGS</p>
            <h2 className="mt-2 text-xl font-black text-slate-950">解約完了による削減ランレート</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600">解約支援で完了にした契約の月額換算を積み上げ、直近12か月の変化を表示します。</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-right">
            <div>
              <p className="text-xs font-bold text-slate-500">現在の月額削減</p>
              <p className="mt-1 text-2xl font-black text-emerald-700">{yen.format(completedSavingsTimeline.currentMonthlyRunRate)}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500">年間ランレート</p>
              <p className="mt-1 text-2xl font-black text-slate-950">{yen.format(completedSavingsTimeline.currentAnnualRunRate)}</p>
            </div>
          </div>
        </div>
        {completedSavingsTimeline.maxRunRate === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-emerald-200 bg-emerald-50/60 p-5">
            <EmptyState text="解約完了した契約が記録されると、ここに12か月の削減推移が表示されます。" />
            <div className="mt-4 text-center"><Link href="/subscriptions" className="btn-secondary">契約を確認する</Link></div>
          </div>
        ) : <div className="mt-6 grid grid-cols-6 gap-2 sm:grid-cols-12" role="img" aria-label="直近12か月の月額削減ランレート">
          {completedSavingsTimeline.points.map((point) => {
            const heightPercent = Math.max(
              MIN_VISIBLE_SAVINGS_BAR_PERCENT,
              Math.round(point.runRate / completedSavingsTimeline.maxRunRate * 100),
            );
            return (
              <div key={`${point.year}-${point.month}`} className="grid min-w-0 grid-rows-[auto_8rem_auto] gap-2 text-center">
                <p className="truncate text-[11px] font-black text-slate-600" title={yen.format(point.runRate)}>{yen.format(point.runRate)}</p>
                <div className="flex items-end overflow-hidden rounded-md bg-emerald-50" title={`${point.year}年${point.month}月 月額削減 ${yen.format(point.runRate)}`}>
                  <div className="w-full rounded-t-md bg-emerald-500" style={{ height: `${heightPercent}%` }} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-700">{point.month}月</p>
                  {point.newMonthlySaving > 0 && <p className="mt-1 text-[11px] font-black text-emerald-700">+{yen.format(point.newMonthlySaving)}</p>}
                </div>
              </div>
            );
          })}
        </div>}
        <p className="mt-5 text-xs font-medium leading-5 text-slate-500">表示額は解約完了時点の契約金額を月額換算した削減ランレートです。実際の返金額や口座残高の増加を示すものではありません。</p>
      </Card>
      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold">{currentYear}年の削減実績</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">解約支援で「解約完了」にした契約を集計しています。</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <MiniMetric label="解約完了" value={`${completedSavings.completedCount}件`} />
            <MiniMetric label="月額削減" value={yen.format(completedSavings.monthlySaving)} />
            <MiniMetric label="年間換算" value={yen.format(completedSavings.annualSaving)} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {completedSavings.achievements.map((achievement) => (
              <span key={achievement.label} className={`rounded-full border px-3 py-1.5 text-sm font-bold ${achievement.reached ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                {achievement.reached ? "達成 " : "未達成 "}{achievement.label}
              </span>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">更新判断履歴</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">直近の判断と理由を振り返れます。判断だけで契約状態は変更されません。</p>
          <div className="mt-4 divide-y divide-slate-100">
            {decisionHistory.length === 0 ? <EmptyState text="更新判断の履歴はまだありません。" /> : decisionHistory.map((decision) => (
              <div key={decision.id} className="grid gap-2 py-3 sm:grid-cols-[90px_1fr_auto] sm:items-start">
                <p className="text-sm font-bold text-slate-500">{decision.year}年{decision.month}月</p>
                <div>
                  <p className="font-bold">{challengeSubscriptionNames.get(decision.subscriptionId) ?? "削除済みの契約"}</p>
                  <p className="mt-1 text-sm text-slate-500">更新 {isoDate(decision.renewalDate)} / 月額換算 {yen.format(decision.potentialMonthlySaving)}</p>
                  {decision.reason && <p className="mt-2 text-sm leading-6 text-slate-600">{decision.reason}</p>}
                </div>
                <span className="w-fit rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-800">{renewalDecisionStatusLabel(decision.status)}</span>
              </div>
            ))}
          </div>
        </Card>
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
                <p className="text-sm font-semibold text-slate-500">補正後試算</p>
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
  const paymentImports = await prisma.statementPaymentImport.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      importedCount: true,
      savedAliasCount: true,
      undoneAt: true,
      undoneCount: true,
      createdAt: true,
      _count: { select: { paymentHistories: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: STATEMENT_PAYMENT_IMPORT_HISTORY_LIMIT,
  });
  const initialPaymentImports: StatementPaymentImportItem[] = paymentImports.map((item) => ({
    id: item.id,
    importedCount: item.importedCount,
    savedAliasCount: item.savedAliasCount,
    remainingCount: item._count.paymentHistories,
    undoneAt: item.undoneAt?.toISOString() ?? null,
    undoneCount: item.undoneCount,
    createdAt: item.createdAt.toISOString(),
  }));
  return (
    <AppShell>
      <PageHeader title="CSV入出力" description="CSVテンプレート、明細サンプル、インポート、エクスポートをまとめて扱えます。1行目がヘッダのCSVにも対応しています。" />
      <Card className="mb-5 border-blue-100 bg-blue-50/80">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-blue-950">CSVを迷わず始める</h2>
            <p className="mt-2 text-sm leading-6 text-blue-800">
              インポート用テンプレートと、明細候補検出を試せるサンプルCSVを用意しました。1行目をヘッダとして使う場合は、そのまま列名を入力して使えます。
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/api/import/template" className="btn-secondary">インポート用テンプレート</Link>
            <Link href="/api/import/statement-sample" className="btn-secondary">明細サンプルCSV</Link>
          </div>
        </div>
      </Card>
      <Card className="mb-5">
        <h2 className="text-lg font-bold">カード・銀行明細を支払い履歴とサブスク候補へ整理</h2>
        <div className="mt-5"><CsvCandidateDetectorForm disabled={disabled} initialPaymentImports={initialPaymentImports} /></div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold">CSVインポート</h2>
          <div className="mt-5"><CsvImportForm disabled={disabled} /></div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">CSV出力</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            出力CSVの1行目はヘッダです。サービス名、円換算金額、請求周期、月額・年額換算、仕事利用割合、仕事利用分、次回更新日、カテゴリ、支払い方法、請求元、ステータス、メモ、外貨の換算根拠を確認できます。
          </p>
          <CsvDownloadButton disabled={disabled} />
          {disabled && <p className="mt-3 text-sm font-semibold text-amber-700">CSV入出力はPremium限定です。</p>}
        </Card>
      </div>
    </AppShell>
  );
}

export async function NotificationsView() {
  const user = await requireVerifiedUser();
  const notificationPreference = await prisma.userPreference.findUnique({
    where: { userId: user.id },
    select: { defaultNotifyDaysBefore: true },
  });
  const allSubscriptions = (await prisma.subscription.findMany({
    where: { userId: user.id, deletedAt: null },
    include: {
      notificationSettings: {
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { enabled: true, daysBefore: true },
      },
    },
    orderBy: { nextBillingDate: "asc" },
  })) as unknown as SubscriptionView[];
  const deliveries = await prisma.notificationDelivery.findMany({
    where: { userId: user.id },
    orderBy: { sentAt: "desc" },
    take: 200,
  });
  const userDeliveries = await prisma.userNotificationDelivery.findMany({
    where: { userId: user.id },
    orderBy: { sentAt: "desc" },
    take: 50,
  });
  const notificationReferenceDate = new Date();
  const subscriptions = limitByPlan(allSubscriptions, user.plan).map((item) => {
    const notification = effectiveSubscriptionNotification({
      settings: item.notificationSettings,
      subscriptionDaysBefore: item.notifyDaysBefore,
      fallbackDaysBefore:
        notificationPreference?.defaultNotifyDaysBefore
        ?? DEFAULT_NOTIFY_DAYS_BEFORE,
    });
    return {
      ...item,
      nextBillingDate: nextBillingOccurrence(item.nextBillingDate, item.billingCycle, item.customCycleDays, notificationReferenceDate),
      notifyDaysBefore: notification.daysBefore,
      notificationsEnabled: notification.enabled,
      notificationSnoozed: isSubscriptionNotificationSnoozed(
        item.notificationSnoozedUntil,
        notificationReferenceDate,
      ),
    };
  });
  const hiddenCount = hiddenByPlan(allSubscriptions.length, user.plan);
  const subscriptionNames = new Map(allSubscriptions.map((item) => [item.id, item.name]));
  const lastSentBySubscription = new Map<string, Date>();
  for (const delivery of deliveries) {
    if (!lastSentBySubscription.has(delivery.subscriptionId)) {
      lastSentBySubscription.set(delivery.subscriptionId, delivery.sentAt);
    }
  }
  const now = notificationReferenceDate;
  const today = japanCalendarDate(now);
  const nextTargets = subscriptions
    .filter((item) => item.notificationsEnabled && !item.notificationSnoozed)
    .flatMap((item) => {
      const deadlineTargets = [
        { label: "更新日", date: item.nextBillingDate },
        { label: "トライアル終了", date: item.trialEndsAt },
        { label: "解約期限", date: item.cancellationDeadline },
      ].flatMap((entry) => {
        const date = entry.date;
        if (!(date instanceof Date) || japanCalendarDate(date).getTime() < today.getTime()) return [];
        return [{ item, label: entry.label, date, requiresAction: false }];
      });
      const scheduledPriceTarget = item.scheduledPrice !== null && item.scheduledPriceAt
        ? [{
            item,
            label: japanCalendarDate(item.scheduledPriceAt).getTime() <= today.getTime()
              ? "価格反映待ち"
              : `価格変更 ${yen.format(item.scheduledPrice)}`,
            date: item.scheduledPriceAt,
            requiresAction: japanCalendarDate(item.scheduledPriceAt).getTime() <= today.getTime(),
          }]
        : [];
      return [...deadlineTargets, ...scheduledPriceTarget];
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <AppShell>
      <PageHeader title="通知" description="更新日、無料期間、解約期限、未使用期間、値上げ、予算の通知予定と送信履歴を確認します。" />
      <PlanLimitBanner hiddenCount={hiddenCount} />
      <Card className="mb-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="font-bold">期限通知</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">更新日・トライアル終了日・解約期限に加え、Premiumでは30・60・90日間の未使用と値上げ登録も通知します。利用記録と見直しが7日間ない契約には、週に1回だけ確認メールを送ります。確認済みの契約は1日・7日・30日だけ一時停止でき、同じ対象日の通知は再送しません。</p>
          </div>
          <NotificationSendButton />
        </div>
      </Card>
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <h2 className="text-lg font-bold">今後の通知予定</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {nextTargets.length === 0 ? <EmptyState text="今後の通知予定はありません。" /> : nextTargets.slice(0, 10).map(({ item, label, date, requiresAction }) => (
              <Link key={item.id + "-" + label + "-" + date.toISOString()} href={"/subscriptions/" + item.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-sm text-slate-500">{label}: {dateText(date)} / {item.notifyDaysBefore ?? DEFAULT_NOTIFY_DAYS_BEFORE}日前に通知</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-black ${requiresAction ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>
                  {requiresAction ? "要反映" : `あと${Math.max(0, daysUntil(date))}日`}
                </span>
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
                const statusTone = !item.notificationsEnabled
                  ? "text-amber-700"
                  : item.notificationSnoozed
                    ? "text-blue-700"
                    : "text-slate-500";
                const statusText = !item.notificationsEnabled
                  ? "この契約のメール通知は停止中です。"
                  : item.notificationSnoozed
                    ? `${dateText(item.notificationSnoozedUntil)}まで一時停止中です。`
                    : `最終送信: ${lastSent ? dateText(lastSent) : "未送信"}`;
                return (
                  <div key={item.id} className="grid gap-3 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div className="min-w-0">
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-sm text-slate-500">更新日 {dateText(item.nextBillingDate)} / トライアル {dateText(item.trialEndsAt)} / 解約期限 {dateText(item.cancellationDeadline)}</p>
                      <p className={`mt-1 text-xs font-semibold ${statusTone}`}>{statusText}</p>
                    </div>
                    <div className="flex flex-wrap items-start justify-between gap-2 lg:justify-end">
                      {item.notificationsEnabled && (
                        <NotificationSnoozeControl
                          subscriptionId={item.id}
                          subscriptionName={item.name}
                          isSnoozed={item.notificationSnoozed}
                        />
                      )}
                      <Link href={"/subscriptions/" + item.id + "/edit"} className={`min-h-0 rounded-lg px-3 py-2 text-sm font-black ${item.notificationsEnabled ? "btn-secondary" : "border border-amber-200 bg-amber-50 text-amber-800"}`}>
                        {item.notificationsEnabled ? `通知条件: ${item.notifyDaysBefore ?? DEFAULT_NOTIFY_DAYS_BEFORE}日前` : "通知設定: 停止中"}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
      {userDeliveries.length > 0 && (
        <Card className="mt-5 border-amber-200 bg-amber-50/70">
          <h2 className="text-lg font-bold text-amber-950">アカウント通知の履歴</h2>
          <p className="mt-1 text-sm leading-6 text-amber-900">予算超過、月次削減チャレンジ、Premiumの月次運用サマリーの送信履歴です。同じ対象月への重複送信は行いません。</p>
          <div className="mt-4 divide-y divide-amber-100">
            {userDeliveries.map((delivery) => (
              <div key={delivery.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold text-amber-950">{userNotificationTypeLabel(delivery.type)}</p>
                  <p className="mt-1 text-sm text-amber-900">対象日 {dateText(delivery.scheduledFor)} / 送信 {notificationSentAt(delivery.sentAt)}</p>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">{userNotificationBadge(delivery.type)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card className="mt-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold">最近の送信履歴</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">送信済みの通知を確認できます。メール本文や宛先は画面に表示しません。</p>
          </div>
          <p className="text-sm font-semibold text-slate-500">直近{Math.min(deliveries.length, 20)}件</p>
        </div>
        <div className="mt-4 divide-y divide-slate-100">
          {deliveries.length === 0 ? <EmptyState text="送信済みの通知はありません。" /> : deliveries.slice(0, 20).map((delivery) => (
            <div key={delivery.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{subscriptionNames.get(delivery.subscriptionId) ?? "削除済みのサブスクリプション"}</p>
                <p className="mt-1 text-sm text-slate-500">対象日 {dateText(delivery.scheduledFor)} / 送信 {notificationSentAt(delivery.sentAt)}</p>
              </div>
              <span className="w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{notificationTypeLabel(delivery.type)}</span>
            </div>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}

type BillingViewProps = {
  checkoutStatus?: string;
  checkoutSessionId?: string;
};

export async function BillingView({ checkoutStatus, checkoutSessionId }: BillingViewProps = {}) {
  const currentUser = await requireVerifiedUser();
  let checkoutNotice: { type: "success" | "error"; message: string } | null = null;

  if (checkoutStatus === "success") {
    if (!checkoutSessionId) {
      checkoutNotice = { type: "error", message: "決済完了情報を確認できませんでした。契約・解約ページを更新してください。" };
    } else {
      try {
        const syncStatus = await syncStripeCheckoutSessionById(checkoutSessionId, currentUser.id);
        if (syncStatus === "synced") {
          checkoutNotice = { type: "success", message: "決済が完了しました。Premiumプランを有効にしました。" };
        } else if (syncStatus === "not_complete") {
          checkoutNotice = { type: "error", message: "Stripe決済がまだ完了していません。しばらく待ってから再読み込みしてください。" };
        } else if (syncStatus === "invalid_user") {
          checkoutNotice = { type: "error", message: "決済情報とログイン中のユーザーが一致しません。" };
        } else {
          checkoutNotice = { type: "error", message: "Stripeの決済情報を確認できませんでした。" };
        }
      } catch {
        console.error("Stripe checkout session sync failed.");
        checkoutNotice = { type: "error", message: "Stripe決済の確認に失敗しました。Webhook設定またはStripe設定を確認してください。" };
      }
    }
  } else if (checkoutStatus === "cancelled") {
    checkoutNotice = { type: "error", message: "Stripe決済はキャンセルされました。契約内容は変更されていません。" };
  }

  const user = await prisma.user.findUnique({
    where: { id: currentUser.id },
    select: {
      email: true,
      plan: true,
      stripeCustomerId: true,
      stripeSubscriptionStatus: true,
      stripeTrialEndAt: true,
      trialUsedAt: true,
      stripeCurrentPeriodEnd: true,
      stripeCancelAt: true,
      stripeCancelAtPeriodEnd: true,
    },
  });
  if (!user) return null;

  const protectedAccount = isProtectedAccountEmail(user.email);
  const stripeInvoicesResult: StripeInvoicesResult = protectedAccount
    ? {
        invoices: [],
        message: "デモ・管理者アカウントでは実際の請求書は発行されません。",
        messageTone: "neutral",
      }
    : await getStripeInvoicesForSettings(user.stripeCustomerId);

  return (
    <AppShell>
      <PageHeader
        title="契約・解約"
        description="プランの確認、Premium申込み、支払い方法の変更、解約、請求書の確認をまとめて行えます。"
      />
      {checkoutNotice && (
        <div className={checkoutNotice.type === "success" ? "mb-5 rounded-lg bg-emerald-50 p-4 text-sm font-semibold text-emerald-700" : "mb-5 rounded-lg bg-red-50 p-4 text-sm font-semibold text-red-700"}>
          {checkoutNotice.message}
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="xl:col-span-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold">プランと契約状態</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Freeと月額Premiumの違いを確認し、Stripeを通じて安全に契約・解約できます。</p>
            </div>
            <span className="w-fit rounded-full bg-blue-50 px-3 py-1.5 text-sm font-black text-blue-800">
              現在: {planLabel(user.plan)}
            </span>
          </div>
          <StripeTrialStatusCard
            plan={user.plan}
            stripeSubscriptionStatus={user.stripeSubscriptionStatus}
            stripeTrialEndAt={user.stripeTrialEndAt}
            trialUsedAt={user.trialUsedAt}
          />
          <StripeContractPeriodCard
            plan={user.plan}
            currentPeriodEnd={user.stripeCurrentPeriodEnd}
            cancelAt={user.stripeCancelAt}
            cancelAtPeriodEnd={user.stripeCancelAtPeriodEnd}
          />
          <div className="mt-5">
            <PlanSettingsForm
              plan={user.plan}
              stripeTestMode={env.stripeTestMode}
              canManageStripe={stripeSubscriptionCanBeManaged(user.stripeSubscriptionStatus)}
              protectedAccount={protectedAccount}
            />
          </div>
        </Card>
        <div className="xl:col-span-2">
          <StripeInvoicesCard result={stripeInvoicesResult} />
        </div>
      </div>
    </AppShell>
  );
}

export async function SettingsView({ emailChangeStatus }: { emailChangeStatus?: string } = {}) {
  const currentUser = await requireVerifiedUser();
  const emailChangeNotice = emailChangeStatus === "success"
    ? { type: "success" as const, message: "メールアドレスを変更しました。" }
    : emailChangeStatus === "success-stripe-pending"
      ? { type: "success" as const, message: "メールアドレスを変更しました。Stripeの請求先メールは次回の課金操作時に再同期します。" }
    : emailChangeStatus === "conflict"
      ? { type: "error" as const, message: "このメールアドレスはすでに利用されているため、変更できませんでした。" }
      : emailChangeStatus === "invalid"
        ? { type: "error" as const, message: "メールアドレス変更のリンクが無効または期限切れです。もう一度確認メールを送信してください。" }
        : emailChangeStatus === "error"
          ? { type: "error" as const, message: "メールアドレスを変更できませんでした。時間をおいて、もう一度お試しください。" }
          : null;


  const user = await prisma.user.findUnique({
    where: { id: currentUser.id },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      createdAt: true,
    },
  });
  if (!user) return null;
  const [preference, loginSecurityEvents] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId: user.id } }),
    prisma.loginSecurityEvent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: LOGIN_SECURITY_EVENT_DISPLAY_LIMIT,
      select: { id: true, type: true, clientLabel: true, createdAt: true },
    }),
  ]);
  return (
    <AppShell>
      <PageHeader title="設定" description="プロフィール、メールアドレス、パスワード、予算、通知、セキュリティを変更できます。" action={<LogoutButton />} />
      {emailChangeNotice && (
        <div className={emailChangeNotice.type === "success" ? "mb-5 rounded-lg bg-emerald-50 p-4 text-sm font-semibold text-emerald-700" : "mb-5 rounded-lg bg-red-50 p-4 text-sm font-semibold text-red-700"}>
          {emailChangeNotice.message}
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold">プロフィール</h2>
          <p className="mt-2 text-sm text-slate-600">表示名を変更できます。</p>
          <div className="mt-5"><ProfileSettingsForm name={user.name ?? ""} email={user.email} /></div>
        </Card>
        {!isProtectedAccountEmail(user.email) && (
          <Card>
            <h2 className="text-lg font-bold">メールアドレス</h2>
            <p className="mt-2 text-sm text-slate-600">新しいメールアドレスを認証してから変更します。</p>
            <div className="mt-5"><EmailSettingsForm email={user.email} /></div>
          </Card>
        )}
        <Card>
          <h2 className="text-lg font-bold">パスワード</h2>
          <p className="mt-2 text-sm text-slate-600">現在のパスワードを確認してから、新しいパスワードへ変更します。</p>
          <div className="mt-5"><PasswordSettingsForm /></div>
        </Card>
        <Card className="xl:col-span-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold">ログインセキュリティ</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">新しい端末からのログインはメールで通知します。心当たりがない場合は、すべての端末をログアウトしてパスワードを変更してください。</p>
            </div>
            <LogoutAllSessionsButton />
          </div>
          <div className="mt-5 divide-y divide-slate-100 border-t border-slate-100">
            {loginSecurityEvents.length === 0 ? (
              <p className="py-4 text-sm text-slate-500">ログイン履歴はまだありません。</p>
            ) : loginSecurityEvents.map((event) => (
              <div key={event.id} className="grid gap-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div>
                  <p className="font-semibold text-slate-900">{loginSecurityEventLabel(event.type)}</p>
                  {event.clientLabel && <p className="mt-1 text-sm text-slate-500">{event.clientLabel}</p>}
                </div>
                <time className="text-sm font-semibold text-slate-500" dateTime={event.createdAt.toISOString()}>{notificationSentAt(event.createdAt)}</time>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">IPアドレスやUser-Agentの原文は保存しません。履歴は直近{LOGIN_SECURITY_EVENT_DISPLAY_LIMIT}件を表示します。</p>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">予算・通知</h2>
          <p className="mt-2 text-sm text-slate-600">月額予算、新規登録時の標準通知日数、自動メールの通知時刻、月次サマリーを管理します。</p>
          <div className="mt-5"><BudgetSettingsForm monthlyBudget={preference?.monthlyBudget} defaultNotifyDaysBefore={preference?.defaultNotifyDaysBefore ?? DEFAULT_NOTIFY_DAYS_BEFORE} notificationHour={preference?.notificationHour ?? DEFAULT_NOTIFICATION_HOUR} monthlyDigestEnabled={preference?.monthlyDigestEnabled ?? true} /></div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">アカウント状態</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Info label="メール" value={user.email} />
            <Info label="メール認証" value={user.emailVerified ? "認証済み" : "未認証"} />
            <Info label="登録日" value={isoDate(user.createdAt)} />
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">アカウントデータの持ち出し</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">契約、支払い、利用履歴、月次締め、解約証跡、通知設定をJSONで保存できます。パスワード、認証トークン、Stripe内部IDは含みません。</p>
          <a href="/api/export/account-data" className="btn-secondary mt-5 inline-flex" download>アカウントデータをダウンロード</a>
        </Card>
        {isProtectedAccountEmail(user.email) ? (
          <Card className="border-slate-200 bg-slate-50/70">
            <h2 className="text-lg font-bold text-slate-900">アカウント削除</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              このアカウントは削除できません。デモアカウントと管理者アカウントは保護されています。
            </p>
          </Card>
        ) : (
          <Card className="border-rose-200 bg-rose-50/70">
            <h2 className="text-lg font-bold text-rose-950">アカウント削除</h2>
            <p className="mt-2 text-sm leading-6 text-rose-900">
              完全削除を行うと、アカウントに紐づくサブスク、カテゴリ、支払い方法、通知設定、証跡、履歴をDBから削除します。取り消しはできません。
            </p>
            <p className="mt-2 text-sm font-semibold leading-6 text-rose-950">
              Premium契約中の場合は、先に「契約管理・解約（Stripe）」で解約を完了してください。継続中または再開可能な契約がある間はアカウントを削除できません。
            </p>
            <div className="mt-5"><AccountDeleteForm email={user.email} /></div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
function MonthlyReportNavigation({ period }: { period: MonthlyReportPeriod }) {
  const previousKey = shiftMonthlyReportKey(period.key, -1);
  const nextKey = shiftMonthlyReportKey(period.key, 1);

  return (
    <nav className="print-hidden mb-6 flex flex-wrap items-center justify-between gap-3 border-y border-slate-200 bg-white/80 px-3 py-3" aria-label="月次レポートの対象月">
      <Link href={`/monthly-report?month=${previousKey}`} className="btn-secondary">前月</Link>
      <p className="text-base font-black text-slate-950">{period.year}年{period.month}月</p>
      <div className="flex flex-wrap gap-2">
        {!period.isCurrent && <Link href={`/monthly-report?month=${nextKey}`} className="btn-secondary">翌月</Link>}
        {!period.isCurrent && <Link href="/monthly-report" className="btn-primary">今月</Link>}
      </div>
    </nav>
  );
}

async function ArchivedMonthlyReportView({ userId, period }: { userId: string; period: MonthlyReportPeriod }) {
  const [monthlyClose, histories] = await Promise.all([
    prisma.monthlyClose.findUnique({
      where: { userId_year_month: { userId, year: period.year, month: period.month } },
    }),
    prisma.paymentHistory.findMany({
      where: { userId, paidAt: { gte: period.previousStart, lt: period.end } },
      include: { subscription: true },
      orderBy: { paidAt: "desc" },
    }),
  ]);
  const paymentHistories = histories as unknown as PaymentHistoryView[];
  const selectedHistories = paymentHistories.filter((item) => item.paidAt >= period.start && item.paidAt < period.end);
  const previousHistories = paymentHistories.filter((item) => item.paidAt >= period.previousStart && item.paidAt < period.start);
  const currentPaid = selectedHistories.reduce((sum, item) => sum + item.amount, 0);
  const previousPaid = previousHistories.reduce((sum, item) => sum + item.amount, 0);
  const businessPaid = selectedHistories.reduce((sum, item) => sum + businessUseAmount(item.amount, item.businessUsePercent), 0);
  const delta = currentPaid - previousPaid;
  const organization = summarizePaymentOrganization(selectedHistories);
  const deltaClass = delta > 0 ? "text-red-600" : delta < 0 ? "text-emerald-600" : "text-slate-950";
  const knownValue = (value: number | null | undefined, suffix = "") => value === null || value === undefined ? "未記録" : `${value}${suffix}`;

  return (
    <AppShell>
      <PageHeader
        title={`${period.year}年${period.month}月 月次レポート`}
        description="保存済みの月次締めと、支払い時点の記録を表示します。"
        action={
          <div className="flex flex-wrap gap-2 print-hidden">
            <a href={`/api/export/monthly-payments?year=${period.year}&month=${period.month}`} className="btn-secondary">当月支払CSV</a>
            <PrintPageButton />
            <Link href="/monthly-report" className="btn-primary">今月へ</Link>
          </div>
        }
      />
      <MonthlyReportNavigation period={period} />

      {monthlyClose ? (
        <Card className="border-blue-100 bg-white/92">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black text-blue-700">保存済み月次締め</p>
              <h2 className="mt-2 text-xl font-black text-slate-950">{period.year}年{period.month}月の確定記録</h2>
              <p className="mt-2 text-sm font-semibold text-slate-500">保存日 {dateText(monthlyClose.completedAt)}</p>
            </div>
            <span className="w-fit rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-800">
              {monthlyClose.readinessScore === null ? "旧形式の締め記録" : `締め準備度 ${monthlyClose.readinessScore}%`}
            </span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {[
              ["支払い実績", yen.format(monthlyClose.paidAmount)],
              ["仕事利用分", yen.format(monthlyClose.businessPaidAmount)],
              ["月額見込み", yen.format(monthlyClose.activeMonthlyAmount)],
              ["契約数", `${monthlyClose.activeSubscriptionCount}件`],
              ["当月見直し", `${monthlyClose.reviewedSubscriptionCount}件`],
              ["期限リスク", `${monthlyClose.deadlineRiskCount}件`],
            ].map(([label, value]) => (
              <div key={label} className="border-y border-slate-100 py-3">
                <p className="text-xs font-bold text-slate-500">{label}</p>
                <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["未解決", knownValue(monthlyClose.unresolvedCount, "件")],
              ["請求確認", knownValue(monthlyClose.reconciliationPercent, "%")],
              ["科目・証憑", knownValue(monthlyClose.organizationPercent, "%")],
              ["更新判断", knownValue(monthlyClose.renewalDecisionPercent, "%")],
            ].map(([label, value]) => (
              <div key={label} className="border-l-4 border-blue-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-bold text-slate-500">{label}</p>
                <p className="mt-1 font-black text-slate-950">{value}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="border-amber-200 bg-amber-50/90">
          <p className="text-xs font-black text-amber-800">締め記録なし</p>
          <h2 className="mt-2 text-xl font-black text-amber-950">この月の契約状況は保存されていません</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-amber-900">
            現在の契約内容で過去を再計算すると当時の状態と食い違うため、契約数・月額見込み・見直し・期限リスクは表示しません。支払い時点に保存した事実だけを確認できます。
          </p>
        </Card>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><p className="text-sm font-semibold text-slate-500">支払い実績</p><p className="mt-2 text-3xl font-black">{yen.format(currentPaid)}</p><p className="mt-2 text-sm text-slate-500">記録済み {selectedHistories.length}件</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">前月比</p><p className={`mt-2 text-3xl font-black ${deltaClass}`}>{delta >= 0 ? "+" : ""}{yen.format(delta)}</p><p className="mt-2 text-sm text-slate-500">前月 {yen.format(previousPaid)}</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">仕事利用分</p><p className="mt-2 text-3xl font-black">{yen.format(businessPaid)}</p><p className="mt-2 text-sm text-slate-500">支払い時点の利用割合</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">支払い整理率</p><p className="mt-2 text-3xl font-black">{organization.totalCount === 0 ? "-" : `${organization.completionPercent}%`}</p><p className="mt-2 text-sm text-slate-500">整理済み {organization.organizedCount}件</p></Card>
      </div>

      <Card className="mt-6">
        <h2 className="text-lg font-black text-slate-950">当月の支払い記録</h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-600">サービス名・カテゴリ・支払い方法は、支払いを登録した時点の内容です。</p>
        <div className="mt-4 divide-y divide-slate-100">
          {selectedHistories.length === 0 ? <EmptyState text="この月の支払い記録はありません。" /> : selectedHistories.map((item) => {
            const missing = paymentOrganizationMissing(item);
            return (
              <div key={item.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-black text-slate-950">{item.subscriptionNameSnapshot}</p>
                  <p className="mt-1 text-sm text-slate-500">{dateText(item.paidAt)} / {item.categoryNameSnapshot ?? "カテゴリ未設定"} / {item.paymentMethodNameSnapshot ?? "支払い方法未設定"}</p>
                  {missing.length > 0 && <p className="mt-2 text-xs font-black text-amber-800">未整理: {missing.join("・")}</p>}
                </div>
                <div className="sm:text-right">
                  <p className="font-black text-slate-950">{yen.format(item.amount)}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">仕事利用分 {yen.format(businessUseAmount(item.amount, item.businessUsePercent))}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <p className="mt-3 text-xs font-medium leading-5 text-slate-500">仕事利用分は入力した割合に基づく整理用の見積もりで、税務上の必要経費を確定するものではありません。</p>
    </AppShell>
  );
}

export async function MonthlyReportView({ month }: { month?: string } = {}) {
  const user = await requireVerifiedUser();
  if (!isPremiumPlan(user.plan)) {
    return <AppShell><PageHeader title="月次レポート" description="今月の支払い予定、前月比、削減候補、期限リスクを確認します。" /><PremiumOnlyNotice title="月次レポートはPremium限定です" description="毎月の固定費レビュー、削減候補、期限リスクの集約はPremiumで利用できます。" /></AppShell>;
  }

  const today = new Date();
  const reportPeriod = resolveMonthlyReportPeriod(month, today);
  if (!reportPeriod.isCurrent) {
    return <ArchivedMonthlyReportView userId={user.id} period={reportPeriod} />;
  }
  const reportToday = japanCalendarDate(today);
  const previousOutcomePeriod = previousMonthlyOutcomePeriod(today);
  const monthStart = reportPeriod.start;
  const monthEndExclusive = reportPeriod.end;
  const previousStart = new Date(Date.UTC(reportPeriod.year, reportPeriod.month - 2, 1));

  const subscriptionRecords = (await prisma.subscription.findMany({
    where: { userId: user.id, deletedAt: null, status: "ACTIVE" },
    include: { category: true, paymentMethod: true },
    orderBy: { nextBillingDate: "asc" },
  })) as unknown as SubscriptionView[];
  const subscriptions = subscriptionRecords.map((item) => ({
    ...item,
    nextBillingDate: nextBillingOccurrence(item.nextBillingDate, item.billingCycle, item.customCycleDays, today),
  }));
  const histories = (await prisma.paymentHistory.findMany({
    where: { userId: user.id, paidAt: { gte: previousStart, lt: monthEndExclusive } },
    include: { subscription: true },
    orderBy: { paidAt: "desc" },
  })) as unknown as PaymentHistoryView[];
  const monthlyCloses = await prisma.monthlyClose.findMany({
    where: { userId: user.id },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: MONTHLY_CLOSE_HISTORY_LIMIT,
  });
  const reportDecisionPeriod = renewalDecisionPeriod(today);
  const currentRenewalDecisions = await prisma.savingChallenge.findMany({
    where: {
      userId: user.id,
      year: reportDecisionPeriod.year,
      month: reportDecisionPeriod.month,
    },
    select: { subscriptionId: true },
  });
  const [previousOutcomeDecisions, previousOutcomeCancellations] = await Promise.all([
    prisma.savingChallenge.findMany({
      where: {
        userId: user.id,
        decidedAt: { gte: previousOutcomePeriod.start, lt: previousOutcomePeriod.end },
      },
      select: { decidedAt: true },
    }),
    prisma.subscription.findMany({
      where: {
        userId: user.id,
        cancellationStatus: "COMPLETED",
        cancellationCompletedAt: { gte: previousOutcomePeriod.start, lt: previousOutcomePeriod.end },
      },
      select: {
        price: true,
        billingCycle: true,
        customCycleDays: true,
        cancellationCompletedAt: true,
      },
    }),
  ]);

  const monthHistories = histories.filter((item) => item.paidAt >= monthStart && item.paidAt < monthEndExclusive);
  const previousHistories = histories.filter((item) => item.paidAt >= previousStart && item.paidAt < monthStart);
  const currentPaid = monthHistories.reduce((sum, item) => sum + item.amount, 0);
  const organization = summarizePaymentOrganization(monthHistories);
  const previousPaid = previousHistories.reduce((sum, item) => sum + item.amount, 0);
  const delta = currentPaid - previousPaid;
  const businessMonthly = subscriptions.reduce(
    (sum, item) => sum + businessUseAmount(monthly(item.price, item.billingCycle, item.customCycleDays), item.businessUsePercent),
    0,
  );
  const deltaClass = delta > 0 ? "text-red-600" : delta < 0 ? "text-emerald-600" : "text-slate-950";
  const activeMonthly = subscriptions.reduce((sum, item) => sum + monthly(item.price, item.billingCycle, item.customCycleDays), 0);
  const monthReconciliation = reconcileBillingPeriod({
    subscriptions: subscriptionRecords,
    payments: histories,
    rangeStart: monthStart,
    rangeEnd: monthEndExclusive,
    now: today,
  });
  const dueThisMonth = monthReconciliation.items;
  const riskItems = subscriptions.filter((item) =>
    (item.trialEndsAt && japanCalendarDate(item.trialEndsAt) >= reportToday && japanCalendarDate(item.trialEndsAt) < monthEndExclusive) ||
    (item.cancellationDeadline && japanCalendarDate(item.cancellationDeadline) >= reportToday && japanCalendarDate(item.cancellationDeadline) < monthEndExclusive),
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
  const closePreview = summarizeMonthlyClose({
    subscriptions,
    payments: monthHistories,
    now: today,
  });
  const currentClose = monthlyCloses.find((item) => item.year === closePreview.year && item.month === closePreview.month) ?? null;
  const previousOutcomeClose = monthlyCloses.find((item) =>
    item.year === previousOutcomePeriod.year && item.month === previousOutcomePeriod.month
  ) ?? null;
  const previousOutcome = summarizePreviousMonthlyOutcome({
    payments: histories,
    decisions: previousOutcomeDecisions,
    cancellations: previousOutcomeCancellations,
    monthlyClose: previousOutcomeClose,
    referenceDate: today,
  });
  const previousCloses = monthlyCloses.filter((item) => item.id !== currentClose?.id);
  const currentRenewalDecisionIds = new Set(
    currentRenewalDecisions.map((decision) => decision.subscriptionId),
  );
  const renewalDecisionDueIds = subscriptions
    .filter((subscription) => isRenewalDecisionDue(subscription.nextBillingDate, today))
    .map((subscription) => subscription.id);
  const closeReadiness = calculateMonthlyCloseReadiness({
    paidAsExpectedCount: monthReconciliation.summary.paidAsExpectedCount,
    amountMismatchCount: monthReconciliation.summary.amountMismatchCount,
    unconfirmedCount: monthReconciliation.summary.unconfirmedCount,
    unmatchedPaymentCount: monthReconciliation.summary.unmatchedPaymentCount,
    paymentCount: organization.totalCount,
    organizedPaymentCount: organization.organizedCount,
    renewalDecisionDueCount: renewalDecisionDueIds.length,
    renewalDecisionCompletedCount: renewalDecisionDueIds.filter((id) =>
      currentRenewalDecisionIds.has(id)
    ).length,
  });

  return (
    <AppShell>
      <PageHeader
        title="月次レポート"
        description="今月見るべき支払い、更新、削減候補を1画面にまとめます。"
        action={
          <div className="flex flex-wrap gap-2 print-hidden">
            <a href={`/api/export/monthly-payments?year=${reportPeriod.year}&month=${reportPeriod.month}`} className="btn-secondary">当月支払CSV</a>
            <PrintPageButton />
            <Link href="/review" className="btn-primary">見直しへ</Link>
          </div>
        }
      />
      <MonthlyReportNavigation period={reportPeriod} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <Card><p className="text-sm font-semibold text-slate-500">今月の支払い実績</p><p className="mt-2 text-3xl font-black">{yen.format(currentPaid)}</p><p className="mt-2 text-sm text-slate-500">記録済み {monthHistories.length}件</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">前月比</p><p className={"mt-2 text-3xl font-black " + deltaClass}>{delta >= 0 ? "+" : ""}{yen.format(delta)}</p><p className="mt-2 text-sm text-slate-500">前月 {yen.format(previousPaid)}</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">仕事利用分</p><p className="mt-2 text-3xl font-black">{yen.format(businessMonthly)}</p><p className="mt-2 text-sm text-slate-500">年間見込み {yen.format(businessMonthly * MONTHS_PER_YEAR)}</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">月額見込み</p><p className="mt-2 text-3xl font-black">{yen.format(activeMonthly)}</p><p className="mt-2 text-sm text-slate-500">アクティブ契約</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">今月の更新</p><p className="mt-2 text-3xl font-black">{dueThisMonth.length}件</p><p className="mt-2 text-sm text-slate-500">期限リスク {riskItems.length}件</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">確度補正後の削減試算</p><p className="mt-2 text-3xl font-black">{yen.format(saving)}</p><p className="mt-2 text-sm text-slate-500">年間 {yen.format(saving * MONTHS_PER_YEAR)}</p></Card>
      </div>
      <p className="mt-3 text-xs font-medium leading-5 text-slate-500">仕事利用分は入力した割合に基づく整理用の見積もりで、税務上の必要経費を確定するものではありません。</p>

      <Card className="mt-6 border-emerald-100 bg-white/92">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black text-emerald-700">PREVIOUS MONTH OUTCOME</p>
            <h2 className="mt-2 text-xl font-black text-slate-950">{previousOutcome.year}年{previousOutcome.month}月の運用結果</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
              支払い時点の記録、更新判断、解約完了、保存済み月次締めから、前月に実際に行った整理をまとめています。
            </p>
          </div>
          <Link href={`/monthly-report?month=${previousOutcome.year}-${String(previousOutcome.month).padStart(2, "0")}`} className="btn-secondary">前月の明細を見る</Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ["支払い実績", yen.format(previousOutcome.paidAmount), `${previousOutcome.paymentCount}件`],
            ["仕事利用分", yen.format(previousOutcome.businessPaidAmount), "支払い時点の割合"],
            ["更新判断", `${previousOutcome.decisionCount}件`, "判断履歴に保存"],
            ["解約完了", `${previousOutcome.cancellationCount}件`, "解約支援で完了"],
            ["解約完了分", `${yen.format(previousOutcome.completedMonthlyReduction)}/月`, "解約前料金の月額換算"],
            [
              "月次締め",
              !previousOutcome.closeRecorded
                ? "未実施"
                : previousOutcome.readinessScore === null
                  ? "記録あり"
                  : `${previousOutcome.readinessScore}%`,
              previousOutcome.closeRecorded
                ? previousOutcome.readinessScore === null
                  ? "旧形式の締め記録"
                  : `未解決 ${previousOutcome.unresolvedCount ?? 0}件`
                : "前月レポートで実施できます",
            ],
          ].map(([label, value, note]) => (
            <div key={label} className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
              <p className="text-xs font-bold text-slate-500">{label}</p>
              <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{note}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs font-medium leading-5 text-slate-500">
          解約完了分は、解約前の契約料金を月額換算した運用上の指標です。実際の返金額や口座残高の増加を示すものではありません。
        </p>
      </Card>

      <Card className="mt-6 border-indigo-100 bg-white/92">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black text-indigo-700">BILLING RECONCILIATION</p>
            <h2 className="mt-2 text-xl font-black text-slate-950">今月の請求予定と支払いを突合</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
              契約の請求日・予定額と支払い履歴を照合します。支払日は予定日の前後{BILLING_RECONCILIATION_MATCH_WINDOW_DAYS}日まで同じ請求として扱います。
            </p>
          </div>
          <Link href="/payments" className="btn-secondary">支払い履歴を確認</Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["請求予定", `${monthReconciliation.summary.expectedCount}件 / ${yen.format(monthReconciliation.summary.expectedAmount)}`],
            ["予定どおり", `${monthReconciliation.summary.paidAsExpectedCount}件`],
            ["金額差異", `${monthReconciliation.summary.amountMismatchCount}件`],
            ["支払い未確認", `${monthReconciliation.summary.unconfirmedCount}件`],
            ["今後の予定", `${monthReconciliation.summary.upcomingCount}件`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
              <p className="text-xs font-bold text-slate-500">{label}</p>
              <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-2 rounded-lg bg-indigo-50 p-4 text-sm font-semibold text-indigo-950 sm:flex-row sm:items-center sm:justify-between">
          <p>
            支払い記録 {yen.format(monthReconciliation.summary.recordedAmount)} / 請求予定との差 {monthReconciliation.summary.amountDifference >= 0 ? "+" : ""}{yen.format(monthReconciliation.summary.amountDifference)}
          </p>
          {monthReconciliation.summary.unmatchedPaymentCount > 0 && (
            <p className="text-amber-800">予定と結び付かない支払いが{monthReconciliation.summary.unmatchedPaymentCount}件あります。</p>
          )}
        </div>
      </Card>

      <Card className="mt-6 border-cyan-100 bg-white/92">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black text-cyan-700">PAYMENT ORGANIZATION</p>
            <h2 className="mt-2 text-lg font-black text-slate-950">今月の支払い整理率 {organization.totalCount === 0 ? "-" : `${organization.completionPercent}%`}</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{organization.organizedCount}件整理済み / {organization.missingCount}件未整理。月次締め前に科目と証憑の紐付けを確認できます。</p>
          </div>
          <Link href="/payments#payment-history-list" className="btn-secondary">支払いを整理</Link>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="今月の支払い整理率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={organization.completionPercent}>
          <div className="h-full rounded-full bg-cyan-600" style={{ width: `${organization.completionPercent}%` }} />
        </div>
      </Card>

      <Card className="mt-6 border-blue-100 bg-white/90">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-black text-blue-700">MONTHLY CLOSE</p>
              <span className={`rounded-full px-2.5 py-1 text-xs font-black ${currentClose ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-900"}`}>
                {currentClose
                  ? currentClose.readinessScore === null
                    ? "締め記録あり（旧形式）"
                    : `締め記録 ${currentClose.readinessScore}%`
                  : "締め記録なし"}
              </span>
            </div>
            <h2 className="mt-2 text-xl font-black text-slate-950">{closePreview.year}年{closePreview.month}月の月次締め</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
              支払い実績、仕事利用分、契約数、見直し、期限リスクを今月の記録として保存します。
            </p>
            {currentClose && (
              <p className="mt-2 text-xs font-semibold text-slate-500">最終更新 {dateText(currentClose.completedAt)}</p>
            )}
          </div>
          <MonthlyCloseButton
            completedAt={currentClose?.completedAt.toISOString() ?? null}
            unresolvedCount={closeReadiness.unresolvedCount}
          />
        </div>
        <div className="mt-5 border-y border-blue-100 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-black text-blue-700">現在の締め準備度</p>
              <p className="mt-1 text-3xl font-black text-slate-950">{closeReadiness.score}<span className="text-sm"> / 100</span></p>
              <p className={`mt-2 text-sm font-bold ${closeReadiness.ready ? "text-emerald-700" : "text-amber-800"}`}>
                {closeReadiness.ready
                  ? "請求・証憑・更新判断の確認が揃っています。"
                  : `未解決項目が${closeReadiness.unresolvedCount}件あります。内容を確認してから締め記録を残してください。`}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[34rem]">
              {[
                ["請求確認", closeReadiness.reconciliationPercent],
                ["科目・証憑", closeReadiness.organizationPercent],
                ["更新判断", closeReadiness.renewalDecisionPercent],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-600"><span>{label}</span><span>{value}%</span></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${value}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
          {closeReadiness.issues.length > 0 && (
            <div className="mt-5 divide-y divide-amber-100 border-y border-amber-100">
              {closeReadiness.issues.map((issue) => {
                const href = issue.code === "UNORGANIZED_PAYMENT" || issue.code === "UNMATCHED_PAYMENT" || issue.code === "AMOUNT_MISMATCH" || issue.code === "UNCONFIRMED_PAYMENT"
                  ? "/payments#payment-history-list"
                  : "/review";
                return (
                  <Link key={issue.code} href={href} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm font-bold text-amber-950 hover:text-blue-700">
                    <span>{issue.label}</span><span className="shrink-0 text-xs">確認する</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ["支払い実績", yen.format(currentClose?.paidAmount ?? closePreview.paidAmount)],
            ["仕事利用分", yen.format(currentClose?.businessPaidAmount ?? closePreview.businessPaidAmount)],
            ["月額見込み", yen.format(currentClose?.activeMonthlyAmount ?? closePreview.activeMonthlyAmount)],
            ["契約数", `${currentClose?.activeSubscriptionCount ?? closePreview.activeSubscriptionCount}件`],
            ["今月見直し", `${currentClose?.reviewedSubscriptionCount ?? closePreview.reviewedSubscriptionCount}件`],
            ["期限リスク", `${currentClose?.deadlineRiskCount ?? closePreview.deadlineRiskCount}件`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
              <p className="text-xs font-bold text-slate-500">{label}</p>
              <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
            </div>
          ))}
        </div>
        {previousCloses.length > 0 && (
          <div className="mt-6 border-t border-slate-100 pt-5">
            <h3 className="text-sm font-black text-slate-800">過去の月次締め</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold text-slate-600">対象月</th>
                    <th className="px-3 py-2 text-right font-bold text-slate-600">支払い実績</th>
                    <th className="px-3 py-2 text-right font-bold text-slate-600">仕事利用分</th>
                    <th className="px-3 py-2 text-right font-bold text-slate-600">締め準備度</th>
                    <th className="px-3 py-2 text-right font-bold text-slate-600">見直し</th>
                    <th className="px-3 py-2 text-right font-bold text-slate-600">期限リスク</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previousCloses.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-3 font-bold">{item.year}年{item.month}月</td>
                      <td className="px-3 py-3 text-right font-black">{yen.format(item.paidAmount)}</td>
                      <td className="px-3 py-3 text-right">{yen.format(item.businessPaidAmount)}</td>
                      <td className="px-3 py-3 text-right">{item.readinessScore === null ? "旧形式" : `${item.readinessScore}%`}</td>
                      <td className="px-3 py-3 text-right">{item.reviewedSubscriptionCount}件</td>
                      <td className="px-3 py-3 text-right">{item.deadlineRiskCount}件</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <h2 className="text-lg font-bold">今月の支払い予定</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {dueThisMonth.length === 0 ? <EmptyState text="今月更新予定の契約はありません。" /> : dueThisMonth.map((item) => (
              <Link key={item.id} href={"/subscriptions/" + item.subscriptionId} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{item.subscriptionName}</p>
                    <span className={`rounded-full px-2 py-1 text-xs font-black ${reconciliationStatusClass(item.status)}`}>
                      {reconciliationStatusLabel(item.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    請求予定 {dateText(item.occurrenceAt)}
                    {item.paidAt ? ` / 支払記録 ${dateText(item.paidAt)}` : ""}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="font-black">予定 {yen.format(item.expectedAmount)}</p>
                  {item.paidAmount !== null && (
                    <p className={`mt-1 text-sm font-bold ${item.difference === 0 ? "text-emerald-700" : "text-amber-800"}`}>
                      実績 {yen.format(item.paidAmount)}
                      {item.difference !== 0 && `（差額 ${item.difference !== null && item.difference > 0 ? "+" : ""}${yen.format(item.difference ?? 0)}）`}
                    </p>
                  )}
                </div>
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
              <p className="mt-3 text-sm font-bold text-slate-700">補正後試算 {yen.format(saving)}/月</p>
            </Link>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}
