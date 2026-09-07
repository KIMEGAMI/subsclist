import {
  MAX_BUSINESS_USE_PERCENT,
  MAX_ACCOUNTING_LABEL_LENGTH,
  MAX_CUSTOM_CYCLE_DAYS,
  MAX_MEMO_LENGTH,
  MAX_NOTIFY_DAYS_BEFORE,
  MAX_SUBSCRIPTION_NAME_LENGTH,
  MAX_SUBSCRIPTION_PRICE,
  MAX_URL_LENGTH,
  MIN_BUSINESS_USE_PERCENT,
  MIN_CUSTOM_CYCLE_DAYS,
} from "./app-constants.ts";
import {
  isSubscriptionCurrency,
  subscriptionCurrencyContext,
} from "./subscription-currency.ts";

export const subscriptionFieldLabels = {
  name: "サービス名",
  price: "料金",
  currency: "請求通貨",
  sourceAmount: "原通貨の請求額",
  exchangeRateToJpy: "円換算レート",
  exchangeRateUpdatedAt: "換算レート確認日",
  billingCycle: "請求周期",
  customCycleDays: "カスタム周期（日数）",
  nextBillingDate: "次回更新日",
  categoryId: "カテゴリ",
  paymentMethodId: "支払い方法",
  billingProvider: "請求元",
  status: "ステータス",
  notifyDaysBefore: "通知日数",
  businessUsePercent: "仕事利用割合",
  defaultAccountingLabel: "整理用初期科目",
  usageFrequency: "利用頻度",
  priority: "重要度",
  trialEndsAt: "無料トライアル終了日",
  cancellationDeadline: "解約期限",
  lastReviewedAt: "最終見直し日",
  serviceUrl: "サービスURL",
  cancellationUrl: "解約URL",
  logoUrl: "ロゴURL",
  memo: "メモ",
} as const;

export type SubscriptionFieldName = keyof typeof subscriptionFieldLabels;
export type SubscriptionFieldErrors = Partial<Record<SubscriptionFieldName, string[]>>;

type ValidationIssue = { path: PropertyKey[] };

const subscriptionFieldMessages: Record<SubscriptionFieldName, string> = {
  name: `サービス名を入力してください（${MAX_SUBSCRIPTION_NAME_LENGTH}文字以内）。`,
  price: `料金は0円以上${MAX_SUBSCRIPTION_PRICE.toLocaleString("ja-JP")}円以下の整数で入力してください。`,
  currency: "請求通貨を選択してください。",
  sourceAmount: "原通貨の請求額を正しく入力してください。",
  exchangeRateToJpy: "1通貨あたりの円換算レートを正しく入力してください。",
  exchangeRateUpdatedAt: "換算レート確認日を正しい日付で入力してください。",
  billingCycle: "請求周期を選択してください。",
  customCycleDays: `カスタム周期は${MIN_CUSTOM_CYCLE_DAYS}日以上${MAX_CUSTOM_CYCLE_DAYS}日以下で入力してください。`,
  nextBillingDate: "次回更新日を正しい日付で入力してください。",
  categoryId: "カテゴリの選択内容を確認してください。",
  paymentMethodId: "支払い方法の選択内容を確認してください。",
  billingProvider: "請求元を選択してください。",
  status: "ステータスを選択してください。",
  notifyDaysBefore: `通知日数は0日以上${MAX_NOTIFY_DAYS_BEFORE}日以下で入力してください。`,
  businessUsePercent: `仕事利用割合は${MIN_BUSINESS_USE_PERCENT}%以上${MAX_BUSINESS_USE_PERCENT}%以下の整数で入力してください。`,
  defaultAccountingLabel: `整理用初期科目は${MAX_ACCOUNTING_LABEL_LENGTH}文字以内で入力してください。`,
  usageFrequency: "利用頻度を選択してください。",
  priority: "重要度を選択してください。",
  trialEndsAt: "無料トライアル終了日を正しい日付で入力してください。",
  cancellationDeadline: "解約期限を正しい日付で入力してください。",
  lastReviewedAt: "最終見直し日を正しい日付で入力してください。",
  serviceUrl: `サービスURLは${MAX_URL_LENGTH}文字以内で入力してください。`,
  cancellationUrl: `解約URLは${MAX_URL_LENGTH}文字以内で入力してください。`,
  logoUrl: `ロゴURLは${MAX_URL_LENGTH}文字以内で入力してください。`,
  memo: `メモは${MAX_MEMO_LENGTH}文字以内で入力してください。`,
};

function isSubscriptionFieldName(value: PropertyKey | undefined): value is SubscriptionFieldName {
  return typeof value === "string" && value in subscriptionFieldLabels;
}

export function subscriptionFieldErrorMessage(fieldErrors: SubscriptionFieldErrors) {
  const labels = Object.keys(fieldErrors)
    .filter((field): field is SubscriptionFieldName => isSubscriptionFieldName(field))
    .map((field) => subscriptionFieldLabels[field]);
  return labels.length > 0
    ? `入力内容を確認してください: ${labels.join("、")}`
    : "入力内容を確認してください。";
}

export function subscriptionValidationDetails(issues: ValidationIssue[]) {
  const fieldErrors: SubscriptionFieldErrors = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (!isSubscriptionFieldName(field) || fieldErrors[field]) continue;
    fieldErrors[field] = [subscriptionFieldMessages[field]];
  }
  return { message: subscriptionFieldErrorMessage(fieldErrors), fieldErrors };
}

export function subscriptionFieldErrorDetails(
  field: SubscriptionFieldName,
  message = subscriptionFieldMessages[field],
) {
  const fieldErrors: SubscriptionFieldErrors = { [field]: [message] };
  return { message: subscriptionFieldErrorMessage(fieldErrors), fieldErrors };
}

export function validateRequiredSubscriptionFields(input: {
  name: string;
  price: string;
  billingCycle: string;
  customCycleDays: string;
  nextBillingDate: string;
  businessUsePercent: string;
  currency?: string;
  sourceAmount?: string;
  exchangeRateToJpy?: string;
}) {
  const fieldErrors: SubscriptionFieldErrors = {};
  const price = Number(input.price);
  const businessUsePercent = Number(input.businessUsePercent);
  const customCycleDays = Number(input.customCycleDays);

  if (!input.name.trim()) fieldErrors.name = [subscriptionFieldMessages.name];
  if (!input.price.trim() || !Number.isInteger(price) || price < 0 || price > MAX_SUBSCRIPTION_PRICE) {
    fieldErrors.price = [subscriptionFieldMessages.price];
  }
  if (!input.nextBillingDate.trim()) fieldErrors.nextBillingDate = [subscriptionFieldMessages.nextBillingDate];
  if (
    !input.businessUsePercent.trim()
    || !Number.isInteger(businessUsePercent)
    || businessUsePercent < MIN_BUSINESS_USE_PERCENT
    || businessUsePercent > MAX_BUSINESS_USE_PERCENT
  ) {
    fieldErrors.businessUsePercent = [subscriptionFieldMessages.businessUsePercent];
  }
  if (
    input.billingCycle === "CUSTOM"
    && (
      !input.customCycleDays.trim()
      || !Number.isInteger(customCycleDays)
      || customCycleDays < MIN_CUSTOM_CYCLE_DAYS
      || customCycleDays > MAX_CUSTOM_CYCLE_DAYS
    )
  ) {
    fieldErrors.customCycleDays = [subscriptionFieldMessages.customCycleDays];
  }
  const currency = input.currency ?? "JPY";
  if (!isSubscriptionCurrency(currency)) {
    fieldErrors.currency = [subscriptionFieldMessages.currency];
  } else {
    const context = subscriptionCurrencyContext({
      currency,
      sourceAmount: input.sourceAmount,
      exchangeRateToJpy: input.exchangeRateToJpy,
    });
    if (!context.ok) fieldErrors[context.field] = [context.message];
  }
  return fieldErrors;
}
