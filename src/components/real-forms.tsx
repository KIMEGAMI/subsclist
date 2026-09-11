"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  MAX_ACCOUNTING_LABEL_LENGTH,
  MAX_CATEGORY_NAME_LENGTH,
  MAX_BUSINESS_USE_PERCENT,
  MAX_CUSTOM_CYCLE_DAYS,
  MAX_EMAIL_LENGTH,
  MAX_MEMO_LENGTH,
  MAX_NOTIFY_DAYS_BEFORE,
  MAX_PAYMENT_HISTORY_MEMO_LENGTH,
  MAX_PAYMENT_REFERENCE_NUMBER_LENGTH,
  MAX_PAYMENT_METHOD_MEMO_LENGTH,
  MAX_PAYMENT_METHOD_NAME_LENGTH,
  MAX_RENEWAL_DECISION_REASON_LENGTH,
  MAX_STATEMENT_MERCHANT_ALIASES_PER_SUBSCRIPTION,
  MAX_STATEMENT_MERCHANT_LABEL_LENGTH,
  MAX_SUBSCRIPTION_NAME_LENGTH,
  MAX_SUBSCRIPTION_PRICE,
  MAX_USER_NAME_LENGTH,
  MAX_URL_LENGTH,
  MIN_BUSINESS_USE_PERCENT,
  MIN_PASSWORD_LENGTH,
  MIN_CUSTOM_CYCLE_DAYS,
  MIN_STATEMENT_MERCHANT_ALIAS_LENGTH,
  PREMIUM_MONTHLY_PRICE_YEN,
  STATEMENT_PAYMENT_IMPORT_HISTORY_LIMIT,
  STRIPE_TRIAL_PERIOD_DAYS,
} from "@/lib/app-constants";
import { isoDate, monthlyAmount } from "@/lib/billing";
import { userErrorMessage, userMessage } from "@/lib/error-messages";
import { PAYMENT_HISTORY_DUPLICATE_CODE } from "@/lib/payment-history-input";
import type { RenewalDecisionStatus } from "@/lib/renewal-decision";
import { stripePaymentMethodOptions } from "@/lib/stripe-payment-methods";
import { statementPaymentImportStatusLabel } from "@/lib/statement-payment-import";
import { BILLING_PROVIDER_VALUES, billingProviderLabel } from "@/lib/subscription-billing-provider";
import {
  SUBSCRIPTION_IMPORT_HEADERS,
  type SubscriptionImportHeader,
  type SubscriptionImportValues,
} from "@/lib/subscription-csv-columns";
import {
  convertedPriceInJpy,
  formatExchangeRateScaled,
  formatSourceAmountMinor,
  isSubscriptionCurrency,
  MAX_EXCHANGE_RATE_INPUT_LENGTH,
  MAX_SOURCE_AMOUNT_INPUT_LENGTH,
  SUBSCRIPTION_CURRENCIES,
  SUBSCRIPTION_CURRENCY_LABELS,
  subscriptionCurrencyContext,
  type SubscriptionCurrency,
} from "@/lib/subscription-currency";
import {
  subscriptionFieldErrorMessage,
  validateRequiredSubscriptionFields,
  type SubscriptionFieldErrors,
  type SubscriptionFieldName,
} from "@/lib/subscription-form-errors";
import {
  weeklyUsageRangeOptions,
  type WeeklyUsageRange,
} from "@/lib/subscription-weekly-review";

type SubscriptionFormValue = {
  id: string;
  name: string;
  price: number;
  currency: string;
  sourceAmountMinor: number | null;
  exchangeRateToJpyScaled: number | null;
  exchangeRateUpdatedAt: Date | string | null;
  billingCycle: string;
  customCycleDays: number | null;
  nextBillingDate: Date | string;
  categoryId: string | null;
  paymentMethodId: string | null;
  billingProvider: string;
  status: string;
  notifyDaysBefore: number | null;
  notificationsEnabled: boolean;
  businessUsePercent: number;
  defaultAccountingLabel: string | null;
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
  billingCycle: "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "YEARLY" | "WEEKLY" | "CUSTOM";
  serviceUrl: string;
  cancellationUrl: string;
};

const servicePresets: ServicePreset[] = [
  {
    name: "Adobe Creative Cloud",
    price: 6480,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.adobe.com/jp/creativecloud.html",
    cancellationUrl: "https://account.adobe.com/plans",
  },
  {
    name: "Amazon Music Unlimited",
    price: 1080,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.amazon.co.jp/music/unlimited",
    cancellationUrl: "https://www.amazon.co.jp/music/settings",
  },
  {
    name: "Amazon Prime",
    price: 5900,
    billingCycle: "YEARLY",
    serviceUrl: "https://www.amazon.co.jp/prime",
    cancellationUrl: "https://www.amazon.co.jp/mc",
  },
  {
    name: "Apple Music",
    price: 1080,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.apple.com/jp/apple-music/",
    cancellationUrl: "https://support.apple.com/ja-jp/HT202039",
  },
  {
    name: "Apple One",
    price: 1200,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.apple.com/jp/apple-one/",
    cancellationUrl: "https://support.apple.com/ja-jp/HT202039",
  },
  {
    name: "Apple TV+",
    price: 900,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.apple.com/jp/apple-tv-plus/",
    cancellationUrl: "https://support.apple.com/ja-jp/HT202039",
  },
  {
    name: "Asana Starter",
    price: 1500,
    billingCycle: "MONTHLY",
    serviceUrl: "https://asana.com/ja/pricing",
    cancellationUrl: "https://help.asana.com/",
  },
  {
    name: "Audible",
    price: 1500,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.audible.co.jp/",
    cancellationUrl: "https://www.audible.co.jp/account/cancel",
  },
  {
    name: "Backlog",
    price: 2970,
    billingCycle: "MONTHLY",
    serviceUrl: "https://backlog.com/ja/pricing/",
    cancellationUrl: "https://support-ja.backlog.com/",
  },
  {
    name: "Box Business",
    price: 1800,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.box.com/ja-jp/pricing",
    cancellationUrl: "https://support.box.com/",
  },
  {
    name: "Canva Pro",
    price: 1180,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.canva.com/ja_jp/pro/",
    cancellationUrl: "https://www.canva.com/help/cancel-canva-plan/",
  },
  {
    name: "ChatGPT Plus",
    price: 3000,
    billingCycle: "MONTHLY",
    serviceUrl: "https://chatgpt.com/",
    cancellationUrl: "https://help.openai.com/",
  },
  {
    name: "Claude Pro",
    price: 3000,
    billingCycle: "MONTHLY",
    serviceUrl: "https://claude.ai/upgrade",
    cancellationUrl: "https://support.anthropic.com/",
  },
  {
    name: "Cookpad Premium",
    price: 400,
    billingCycle: "MONTHLY",
    serviceUrl: "https://premium-service.cookpad.com/",
    cancellationUrl: "https://help.cookpad.com/",
  },
  {
    name: "Coursera Plus",
    price: 5900,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.coursera.org/courseraplus",
    cancellationUrl: "https://www.coursera.support/",
  },
  {
    name: "Cursor Pro",
    price: 3000,
    billingCycle: "MONTHLY",
    serviceUrl: "https://cursor.com/pricing",
    cancellationUrl: "https://docs.cursor.com/account",
  },
  {
    name: "DAZN",
    price: 4200,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.dazn.com/ja-JP/home",
    cancellationUrl: "https://www.dazn.com/myaccount",
  },
  {
    name: "DeepL Pro",
    price: 1150,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.deepl.com/ja/pro",
    cancellationUrl: "https://support.deepl.com/",
  },
  {
    name: "Disney+",
    price: 990,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.disneyplus.com/ja-jp",
    cancellationUrl: "https://www.disneyplus.com/account",
  },
  {
    name: "Dropbox Plus",
    price: 1500,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.dropbox.com/plans",
    cancellationUrl:
      "https://help.dropbox.com/account-access/cancel-subscription",
  },
  {
    name: "Evernote Personal",
    price: 1100,
    billingCycle: "MONTHLY",
    serviceUrl: "https://evernote.com/intl/jp/compare-plans",
    cancellationUrl: "https://help.evernote.com/",
  },
  {
    name: "Figma Professional",
    price: 1800,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.figma.com/pricing/",
    cancellationUrl: "https://help.figma.com/",
  },
  {
    name: "GitHub Copilot",
    price: 1500,
    billingCycle: "MONTHLY",
    serviceUrl: "https://github.com/features/copilot/plans",
    cancellationUrl: "https://docs.github.com/billing",
  },
  {
    name: "Google One",
    price: 250,
    billingCycle: "MONTHLY",
    serviceUrl: "https://one.google.com/",
    cancellationUrl: "https://one.google.com/settings",
  },
  {
    name: "Google Workspace Business Starter",
    price: 800,
    billingCycle: "MONTHLY",
    serviceUrl: "https://workspace.google.com/intl/ja/pricing.html",
    cancellationUrl: "https://support.google.com/a/answer/1257646",
  },
  {
    name: "Grammarly Pro",
    price: 1800,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.grammarly.com/plans",
    cancellationUrl: "https://support.grammarly.com/",
  },
  {
    name: "Hulu",
    price: 1026,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.hulu.jp/",
    cancellationUrl: "https://help.hulu.jp/",
  },
  {
    name: "iCloud+",
    price: 150,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.apple.com/jp/icloud/",
    cancellationUrl: "https://support.apple.com/ja-jp/HT207594",
  },
  {
    name: "Kindle Unlimited",
    price: 980,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.amazon.co.jp/kindle-dbs/hz/subscribe/ku",
    cancellationUrl:
      "https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc",
  },
  {
    name: "LINE MUSIC",
    price: 1080,
    billingCycle: "MONTHLY",
    serviceUrl: "https://music.line.me/",
    cancellationUrl: "https://help2.line.me/LINEMusic/",
  },
  {
    name: "Microsoft 365 Personal",
    price: 1490,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.microsoft.com/ja-jp/microsoft-365",
    cancellationUrl: "https://account.microsoft.com/services",
  },
  {
    name: "Money Forward ME Premium",
    price: 500,
    billingCycle: "MONTHLY",
    serviceUrl: "https://moneyforward.com/",
    cancellationUrl: "https://support.me.moneyforward.com/",
  },
  {
    name: "Netflix",
    price: 1490,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.netflix.com/",
    cancellationUrl: "https://www.netflix.com/cancelplan",
  },
  {
    name: "NewsPicks Premium",
    price: 1850,
    billingCycle: "MONTHLY",
    serviceUrl: "https://newspicks.com/",
    cancellationUrl: "https://newspicks.zendesk.com/",
  },
  {
    name: "Nintendo Switch Online",
    price: 2400,
    billingCycle: "YEARLY",
    serviceUrl: "https://www.nintendo.com/jp/hardware/switch/onlineservice/",
    cancellationUrl: "https://support.nintendo.com/",
  },
  {
    name: "Notion Plus",
    price: 1650,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.notion.so/pricing",
    cancellationUrl: "https://www.notion.so/help",
  },
  {
    name: "Perplexity Pro",
    price: 3000,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.perplexity.ai/pro",
    cancellationUrl: "https://www.perplexity.ai/settings/subscription",
  },
  {
    name: "PlayStation Plus Essential",
    price: 850,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.playstation.com/ja-jp/ps-plus/",
    cancellationUrl:
      "https://www.playstation.com/ja-jp/support/store/cancel-ps-store-subscription/",
  },
  {
    name: "Proton Unlimited",
    price: 1800,
    billingCycle: "MONTHLY",
    serviceUrl: "https://proton.me/pricing",
    cancellationUrl: "https://proton.me/support",
  },
  {
    name: "Sakura VPS",
    price: 880,
    billingCycle: "MONTHLY",
    serviceUrl: "https://vps.sakura.ad.jp/",
    cancellationUrl: "https://help.sakura.ad.jp/",
  },
  {
    name: "Salesforce Starter",
    price: 3000,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.salesforce.com/jp/editions-pricing/sales-cloud/",
    cancellationUrl: "https://help.salesforce.com/",
  },
  {
    name: "Slack Pro",
    price: 1050,
    billingCycle: "MONTHLY",
    serviceUrl: "https://slack.com/intl/ja-jp/pricing",
    cancellationUrl: "https://slack.com/help/articles/218915077",
  },
  {
    name: "Spotify Premium",
    price: 980,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.spotify.com/jp/premium/",
    cancellationUrl: "https://www.spotify.com/account/subscription/",
  },
  {
    name: "Storytel",
    price: 980,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.storytel.com/jp",
    cancellationUrl: "https://support.storytel.com/",
  },
  {
    name: "TickTick Premium",
    price: 450,
    billingCycle: "MONTHLY",
    serviceUrl: "https://ticktick.com/about/upgrade",
    cancellationUrl: "https://support.ticktick.com/",
  },
  {
    name: "Trello Premium",
    price: 1500,
    billingCycle: "MONTHLY",
    serviceUrl: "https://trello.com/pricing",
    cancellationUrl: "https://support.atlassian.com/trello/",
  },
  {
    name: "U-NEXT",
    price: 2189,
    billingCycle: "MONTHLY",
    serviceUrl: "https://video.unext.jp/",
    cancellationUrl: "https://help.unext.jp/",
  },
  {
    name: "Udemy Personal Plan",
    price: 2400,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.udemy.com/personal-plan/",
    cancellationUrl: "https://support.udemy.com/",
  },
  {
    name: "Visual Studio Code Pro",
    price: 1500,
    billingCycle: "MONTHLY",
    serviceUrl: "https://code.visualstudio.com/",
    cancellationUrl: "https://support.microsoft.com/",
  },
  {
    name: "Wolt+",
    price: 498,
    billingCycle: "MONTHLY",
    serviceUrl: "https://wolt.com/ja/wolt-plus",
    cancellationUrl: "https://explore.wolt.com/ja/jpn/help",
  },
  {
    name: "Xbox Game Pass Ultimate",
    price: 1450,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.xbox.com/ja-JP/xbox-game-pass",
    cancellationUrl: "https://account.microsoft.com/services",
  },
  {
    name: "Yahoo!プレミアム",
    price: 508,
    billingCycle: "MONTHLY",
    serviceUrl: "https://premium.yahoo.co.jp/",
    cancellationUrl: "https://premium.yahoo.co.jp/cancel",
  },
  {
    name: "YouTube Premium",
    price: 1280,
    billingCycle: "MONTHLY",
    serviceUrl: "https://www.youtube.com/premium",
    cancellationUrl: "https://www.youtube.com/paid_memberships",
  },
  {
    name: "Zoom Pro",
    price: 2000,
    billingCycle: "MONTHLY",
    serviceUrl: "https://zoom.us/pricing",
    cancellationUrl: "https://support.zoom.com/",
  },
];

class FormRequestError extends Error {
  constructor(message: string, readonly fieldErrors: SubscriptionFieldErrors = {}, readonly code?: string) {
    super(message);
    this.name = "FormRequestError";
  }
}

async function request(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as {
    message?: string;
    code?: string;
    id?: string;
    created?: boolean;
    usedToday?: boolean;
    fieldErrors?: SubscriptionFieldErrors;
  };
  if (!response.ok)
    throw new FormRequestError(
      userMessage(data.message, "処理に失敗しました。"),
      data.fieldErrors,
      data.code,
    );
  return data;
}

export { LogoutButton } from "@/components/logout-button";

export function SubscriptionForm({
  subscription,
  categories,
  paymentMethods,
  monthlyBudget,
  currentMonthlyTotal,
  defaultNotifyDaysBefore,
}: {
  subscription?: SubscriptionFormValue | null;
  categories: Option[];
  paymentMethods: Option[];
  monthlyBudget: number | null;
  currentMonthlyTotal: number;
  defaultNotifyDaysBefore: number;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<SubscriptionFieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [billingCycle, setBillingCycle] = useState(
    subscription?.billingCycle ?? "MONTHLY",
  );
  const initialMonthlyCost = subscription
    ? monthlyAmount(
        subscription.price,
        subscription.billingCycle,
        subscription.customCycleDays,
      )
    : 0;
  const [projectedMonthlyTotal, setProjectedMonthlyTotal] = useState(
    currentMonthlyTotal + initialMonthlyCost,
  );
  const initialCurrency = isSubscriptionCurrency(subscription?.currency ?? "")
    ? (subscription?.currency as SubscriptionCurrency)
    : "JPY";
  const [currency, setCurrency] =
    useState<SubscriptionCurrency>(initialCurrency);
  const allFieldErrorMessages = Object.values(fieldErrors).flatMap((messages) => messages ?? []);

  function inputErrorProps(field: SubscriptionFieldName) {
    const hasError = Boolean(fieldErrors[field]?.length);
    return {
      "aria-invalid": hasError,
      "aria-describedby": hasError ? `${field}-error` : undefined,
    };
  }

  function updateBudgetPreview(form: HTMLFormElement) {
    const values = new FormData(form);
    const price = Number(values.get("price") ?? 0);
    const selectedBillingCycle = String(
      values.get("billingCycle") ?? "MONTHLY",
    );
    const customCycleDays = Number(values.get("customCycleDays") ?? 0);
    const monthlyCost =
      Number.isFinite(price) && price >= 0
        ? monthlyAmount(
            price,
            selectedBillingCycle,
            Number.isFinite(customCycleDays) && customCycleDays > 0
              ? customCycleDays
              : null,
          )
        : 0;
    setProjectedMonthlyTotal(currentMonthlyTotal + monthlyCost);
  }

  function applyPreset(event: React.ChangeEvent<HTMLSelectElement>) {
    const preset = servicePresets.find(
      (item) => item.name === event.target.value,
    );
    const form = event.currentTarget.form;
    if (!preset || !form) return;
    setInputValue(form, "name", preset.name);
    setInputValue(form, "price", String(preset.price));
    setInputValue(form, "currency", "JPY");
    setCurrency("JPY");
    setInputValue(form, "billingCycle", preset.billingCycle);
    setBillingCycle(preset.billingCycle);
    setInputValue(form, "serviceUrl", preset.serviceUrl);
    setInputValue(form, "cancellationUrl", preset.cancellationUrl);
    setProjectedMonthlyTotal(
      currentMonthlyTotal + monthlyAmount(preset.price, preset.billingCycle),
    );
  }

  function changeBillingCycle(event: React.ChangeEvent<HTMLSelectElement>) {
    setBillingCycle(event.target.value);
    const form = event.currentTarget.form;
    if (form) queueMicrotask(() => updateBudgetPreview(form));
  }

  function changeCurrency(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextCurrency = event.target.value;
    if (isSubscriptionCurrency(nextCurrency)) setCurrency(nextCurrency);
  }

  function applyConvertedPrice(event: React.MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    if (!form) return;
    const values = new FormData(form);
    const context = subscriptionCurrencyContext({
      currency,
      sourceAmount: String(values.get("sourceAmount") ?? ""),
      exchangeRateToJpy: String(values.get("exchangeRateToJpy") ?? ""),
    });
    if (!context.ok) {
      const nextErrors: SubscriptionFieldErrors = {
        [context.field]: [context.message],
      };
      setFieldErrors(nextErrors);
      setError(subscriptionFieldErrorMessage(nextErrors));
      focusFirstInvalidField(form, nextErrors);
      return;
    }
    if (
      context.data.sourceAmountMinor === null
      || context.data.exchangeRateToJpyScaled === null
    ) return;
    const converted = convertedPriceInJpy(
      context.data.sourceAmountMinor,
      context.data.currency,
      context.data.exchangeRateToJpyScaled,
    );
    if (converted > MAX_SUBSCRIPTION_PRICE) {
      const nextErrors: SubscriptionFieldErrors = {
        price: [`円換算額は${MAX_SUBSCRIPTION_PRICE.toLocaleString("ja-JP")}円以下にしてください。`],
      };
      setFieldErrors(nextErrors);
      setError(subscriptionFieldErrorMessage(nextErrors));
      return;
    }
    setInputValue(form, "price", String(converted));
    setFieldErrors({});
    setError("");
    updateBudgetPreview(form);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFieldErrors({});
    const formElement = event.currentTarget;

    const form = new FormData(formElement);
    const requiredErrors = validateRequiredSubscriptionFields({
      name: String(form.get("name") ?? ""),
      price: String(form.get("price") ?? ""),
      billingCycle: String(form.get("billingCycle") ?? ""),
      customCycleDays: String(form.get("customCycleDays") ?? ""),
      nextBillingDate: String(form.get("nextBillingDate") ?? ""),
      businessUsePercent: String(form.get("businessUsePercent") ?? ""),
      currency: String(form.get("currency") ?? "JPY"),
      sourceAmount: String(form.get("sourceAmount") ?? ""),
      exchangeRateToJpy: String(form.get("exchangeRateToJpy") ?? ""),
    });
    if (Object.keys(requiredErrors).length > 0) {
      setFieldErrors(requiredErrors);
      setError(subscriptionFieldErrorMessage(requiredErrors));
      focusFirstInvalidField(formElement, requiredErrors);
      return;
    }

    setLoading(true);
    const payload = Object.fromEntries(form.entries());
    try {
      const data = await request(
        subscription
          ? `/api/subscriptions/${subscription.id}`
          : "/api/subscriptions",
        subscription ? "PUT" : "POST",
        payload,
      );
      router.push(`/subscriptions/${data.id ?? subscription?.id}`);
      router.refresh();
    } catch (err) {
      setError(userErrorMessage(err, "保存に失敗しました。"));
      if (err instanceof FormRequestError) {
        setFieldErrors(err.fieldErrors);
        focusFirstInvalidField(formElement, err.fieldErrors);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      onInput={(event) => updateBudgetPreview(event.currentTarget)}
      noValidate
      className="grid gap-4 md:grid-cols-2"
    >
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 md:col-span-2">
          <p>{error}</p>
          {allFieldErrorMessages.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {allFieldErrorMessages.map((message) => <li key={message}>{message}</li>)}
            </ul>
          )}
        </div>
      )}
      <Field label="サービスプリセット">
        <select onChange={applyPreset} className="input" defaultValue="">
          <option value="">手入力する</option>
          {servicePresets.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="サービス名" name="name" error={fieldErrors.name}>
        <input
          name="name"
          {...inputErrorProps("name")}
          defaultValue={subscription?.name ?? ""}
          className="input"
          maxLength={MAX_SUBSCRIPTION_NAME_LENGTH}
          required
        />
      </Field>
      <Field label={currency === "JPY" ? "料金" : "料金（円換算）"} name="price" error={fieldErrors.price}>
        <input
          name="price"
          {...inputErrorProps("price")}
          type="number"
          defaultValue={subscription?.price ?? 0}
          className="input"
          min={0}
          max={MAX_SUBSCRIPTION_PRICE}
          step={1}
          required
        />
      </Field>
      <Field label="請求周期" name="billingCycle" error={fieldErrors.billingCycle}>
        <select
          name="billingCycle"
          {...inputErrorProps("billingCycle")}
          value={billingCycle}
          onChange={changeBillingCycle}
          className="input"
          required
        >
          <option value="MONTHLY">月額</option>
          <option value="QUARTERLY">3か月ごと</option>
          <option value="SEMIANNUAL">6か月ごと</option>
          <option value="YEARLY">年額</option>
          <option value="WEEKLY">週額</option>
          <option value="CUSTOM">カスタム</option>
        </select>
      </Field>
      {billingCycle === "CUSTOM" && (
        <Field label="カスタム周期（日数）" name="customCycleDays" error={fieldErrors.customCycleDays}>
          <input
            name="customCycleDays"
            {...inputErrorProps("customCycleDays")}
            type="number"
            defaultValue={subscription?.customCycleDays ?? ""}
            className="input"
            min={MIN_CUSTOM_CYCLE_DAYS}
            max={MAX_CUSTOM_CYCLE_DAYS}
            required
          />
          <span className="text-xs font-medium text-slate-500">
            例: 45日ごとの請求なら45
          </span>
        </Field>
      )}
      {monthlyBudget !== null && (
        <BudgetPreview
          monthlyBudget={monthlyBudget}
          projectedMonthlyTotal={projectedMonthlyTotal}
        />
      )}
      <Field label="次回更新日" name="nextBillingDate" error={fieldErrors.nextBillingDate}>
        <input
          name="nextBillingDate"
          {...inputErrorProps("nextBillingDate")}
          type="date"
          defaultValue={dateValue(subscription?.nextBillingDate)}
          className="input"
          required
        />
      </Field>
      <Field label="カテゴリ" name="categoryId" error={fieldErrors.categoryId}>
        <select
          name="categoryId"
          {...inputErrorProps("categoryId")}
          defaultValue={subscription?.categoryId ?? ""}
          className="input"
        >
          <option value="">未設定</option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="支払い方法" name="paymentMethodId" error={fieldErrors.paymentMethodId}>
        <select
          name="paymentMethodId"
          {...inputErrorProps("paymentMethodId")}
          defaultValue={subscription?.paymentMethodId ?? ""}
          className="input"
        >
          <option value="">未設定</option>
          {paymentMethods.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="ステータス" name="status" error={fieldErrors.status}>
        <select
          name="status"
          {...inputErrorProps("status")}
          defaultValue={subscription?.status ?? "ACTIVE"}
          className="input"
          required
        >
          <option value="ACTIVE">有効</option>
          <option value="PAUSED">一時停止</option>
          <option value="CANCELLED">解約済み</option>
        </select>
      </Field>
      <Field label="通知日数" name="notifyDaysBefore" error={fieldErrors.notifyDaysBefore}>
        <input
          name="notifyDaysBefore"
          {...inputErrorProps("notifyDaysBefore")}
          type="number"
          defaultValue={
            subscription?.notifyDaysBefore ?? defaultNotifyDaysBefore
          }
          className="input"
          min={0}
          max={MAX_NOTIFY_DAYS_BEFORE}
          step={1}
        />
      </Field>
      <Field label="請求通貨" name="currency" error={fieldErrors.currency}>
        <select
          name="currency"
          {...inputErrorProps("currency")}
          value={currency}
          onChange={changeCurrency}
          className="input"
          required
        >
          {SUBSCRIPTION_CURRENCIES.map((item) => (
            <option key={item} value={item}>
              {SUBSCRIPTION_CURRENCY_LABELS[item]}
            </option>
          ))}
        </select>
      </Field>
      {currency !== "JPY" && (
        <div className="grid gap-4 border-y border-blue-100 bg-blue-50/70 p-4 md:col-span-2 md:grid-cols-3">
          <Field label={`原通貨の請求額（${currency}）`} name="sourceAmount" error={fieldErrors.sourceAmount}>
            <input
              name="sourceAmount"
              {...inputErrorProps("sourceAmount")}
              inputMode="decimal"
              defaultValue={
                subscription?.sourceAmountMinor !== null
                && subscription?.sourceAmountMinor !== undefined
                && initialCurrency === currency
                  ? formatSourceAmountMinor(subscription.sourceAmountMinor, currency)
                  : ""
              }
              className="input"
              maxLength={MAX_SOURCE_AMOUNT_INPUT_LENGTH}
              required
            />
          </Field>
          <Field label="1通貨あたりの円換算レート" name="exchangeRateToJpy" error={fieldErrors.exchangeRateToJpy}>
            <input
              name="exchangeRateToJpy"
              {...inputErrorProps("exchangeRateToJpy")}
              inputMode="decimal"
              defaultValue={
                subscription?.exchangeRateToJpyScaled !== null
                && subscription?.exchangeRateToJpyScaled !== undefined
                && initialCurrency === currency
                  ? formatExchangeRateScaled(subscription.exchangeRateToJpyScaled)
                  : ""
              }
              className="input"
              maxLength={MAX_EXCHANGE_RATE_INPUT_LENGTH}
              required
            />
          </Field>
          <Field label="換算レート確認日" name="exchangeRateUpdatedAt" error={fieldErrors.exchangeRateUpdatedAt}>
            <input
              name="exchangeRateUpdatedAt"
              {...inputErrorProps("exchangeRateUpdatedAt")}
              type="date"
              defaultValue={dateValue(subscription?.exchangeRateUpdatedAt) || isoDate(new Date())}
              className="input"
              required
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3 md:col-span-3">
            <button type="button" onClick={applyConvertedPrice} className="btn-secondary">
              円換算額へ反映
            </button>
            <p className="text-xs font-medium text-slate-600">
              原通貨とレートは換算根拠として保存します。集計には料金（円換算）を使用します。
            </p>
          </div>
        </div>
      )}
      <Field label="請求元" name="billingProvider" error={fieldErrors.billingProvider}>
        <select
          name="billingProvider"
          {...inputErrorProps("billingProvider")}
          defaultValue={subscription?.billingProvider ?? "DIRECT"}
          className="input"
          required
        >
          {BILLING_PROVIDER_VALUES.map((value) => (
            <option key={value} value={value}>{billingProviderLabel(value)}</option>
          ))}
        </select>
        <span className="text-xs font-medium leading-5 text-slate-500">App Storeなどを経由した契約は、サービスではなく実際の請求元で解約します。</span>
      </Field>
      <Field label="メール通知">
        <input type="hidden" name="notificationsEnabled" value="false" />
        <span className="flex min-h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
          <input
            name="notificationsEnabled"
            type="checkbox"
            value="true"
            defaultChecked={subscription?.notificationsEnabled ?? true}
            className="size-5 accent-blue-600"
          />
          <span>
            <span className="block font-bold text-slate-800">この契約の通知を受け取る</span>
            <span className="mt-1 block text-xs font-medium leading-5 text-slate-500">更新日、無料期間、解約期限、利用確認などの対象メールをまとめて停止・再開できます。</span>
          </span>
        </span>
      </Field>
      <Field label="仕事利用割合" name="businessUsePercent" error={fieldErrors.businessUsePercent}>
        <input
          name="businessUsePercent"
          {...inputErrorProps("businessUsePercent")}
          type="number"
          defaultValue={subscription?.businessUsePercent ?? MIN_BUSINESS_USE_PERCENT}
          className="input"
          min={MIN_BUSINESS_USE_PERCENT}
          max={MAX_BUSINESS_USE_PERCENT}
          step={1}
          required
        />
        <span className="text-xs font-medium leading-5 text-slate-500">
          0は個人利用、100は仕事利用です。仕事と個人で兼用する場合は、仕事で使う割合を入力してください。
        </span>
      </Field>
      <Field label="整理用初期科目（任意）" name="defaultAccountingLabel" error={fieldErrors.defaultAccountingLabel}>
        <input
          name="defaultAccountingLabel"
          {...inputErrorProps("defaultAccountingLabel")}
          defaultValue={subscription?.defaultAccountingLabel ?? ""}
          className="input"
          maxLength={MAX_ACCOUNTING_LABEL_LENGTH}
          placeholder="通信費、支払手数料など"
        />
        <span className="text-xs font-medium leading-5 text-slate-500">
          今後の支払い履歴へ初期表示します。税務上の科目を確定するものではありません。
        </span>
      </Field>
      <Field label="利用頻度" name="usageFrequency" error={fieldErrors.usageFrequency}>
        <select
          name="usageFrequency"
          {...inputErrorProps("usageFrequency")}
          defaultValue={subscription?.usageFrequency ?? "UNKNOWN"}
          className="input"
        >
          <option value="UNKNOWN">未設定</option>
          <option value="DAILY">毎日使う</option>
          <option value="WEEKLY">週に数回使う</option>
          <option value="MONTHLY">月に数回使う</option>
          <option value="RARELY">ほとんど使っていない</option>
        </select>
      </Field>
      <Field label="重要度" name="priority" error={fieldErrors.priority}>
        <select
          name="priority"
          {...inputErrorProps("priority")}
          defaultValue={subscription?.priority ?? "UNKNOWN"}
          className="input"
        >
          <option value="UNKNOWN">未設定</option>
          <option value="ESSENTIAL">必須</option>
          <option value="USEFUL">あると便利</option>
          <option value="OPTIONAL">なくても困らない</option>
        </select>
      </Field>
      <Field label="無料トライアル終了日" name="trialEndsAt" error={fieldErrors.trialEndsAt}>
        <input
          name="trialEndsAt"
          {...inputErrorProps("trialEndsAt")}
          type="date"
          defaultValue={dateValue(subscription?.trialEndsAt)}
          className="input"
        />
      </Field>
      <Field label="解約期限" name="cancellationDeadline" error={fieldErrors.cancellationDeadline}>
        <input
          name="cancellationDeadline"
          {...inputErrorProps("cancellationDeadline")}
          type="date"
          defaultValue={dateValue(subscription?.cancellationDeadline)}
          className="input"
        />
      </Field>
      <Field label="最終見直し日" name="lastReviewedAt" error={fieldErrors.lastReviewedAt}>
        <input
          name="lastReviewedAt"
          {...inputErrorProps("lastReviewedAt")}
          type="date"
          defaultValue={dateValue(subscription?.lastReviewedAt)}
          className="input"
        />
      </Field>
      <Field label="サービスURL" name="serviceUrl" error={fieldErrors.serviceUrl}>
        <input
          name="serviceUrl"
          {...inputErrorProps("serviceUrl")}
          defaultValue={subscription?.serviceUrl ?? ""}
          className="input"
          type="url"
          maxLength={MAX_URL_LENGTH}
        />
      </Field>
      <Field label="解約URL" name="cancellationUrl" error={fieldErrors.cancellationUrl}>
        <input
          name="cancellationUrl"
          {...inputErrorProps("cancellationUrl")}
          defaultValue={subscription?.cancellationUrl ?? ""}
          className="input"
          type="url"
          maxLength={MAX_URL_LENGTH}
        />
      </Field>
      <Field label="ロゴURL" name="logoUrl" error={fieldErrors.logoUrl}>
        <input
          name="logoUrl"
          {...inputErrorProps("logoUrl")}
          defaultValue={subscription?.logoUrl ?? ""}
          className="input"
          type="url"
          maxLength={MAX_URL_LENGTH}
          placeholder="画像URLを入力（未入力なら文字アイコン）"
        />
      </Field>
      <label className="grid gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
        メモ
        <textarea
          name="memo"
          {...inputErrorProps("memo")}
          defaultValue={subscription?.memo ?? ""}
          className="input min-h-28"
          maxLength={MAX_MEMO_LENGTH}
        />
        {fieldErrors.memo?.map((message) => (
          <span key={message} id="memo-error" className="text-sm font-bold text-red-700">{message}</span>
        ))}
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
  return isoDate(value);
}

async function requestPaymentHistoryWithDuplicateConfirmation(
  url: string,
  method: "POST" | "PATCH",
  body: Record<string, FormDataEntryValue>,
) {
  try {
    return await request(url, method, body);
  } catch (error) {
    if (!(error instanceof FormRequestError) || error.code !== PAYMENT_HISTORY_DUPLICATE_CODE) throw error;
    const confirmed = window.confirm(`${error.message}\n\n正当な複数請求として、この内容を保存しますか？`);
    if (!confirmed) throw new FormRequestError("重複する支払い履歴の保存を中止しました。");
    return request(url, method, { ...body, allowDuplicate: true });
  }
}

function focusFirstInvalidField(form: HTMLFormElement, errors: SubscriptionFieldErrors) {
  const firstField = Object.keys(errors)[0];
  if (!firstField) return;
  const element = form.elements.namedItem(firstField);
  if (element instanceof HTMLElement) element.focus();
}
type CsvHelpRow = {
  label: string;
  description: string;
};

function CsvHelpPopover({
  title,
  note,
  rows,
}: {
  title: string;
  note: string;
  rows: CsvHelpRow[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex size-7 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-black text-slate-600 shadow-sm transition hover:border-blue-300 hover:text-blue-700"
        aria-expanded={open}
        aria-label={`${title}の説明を表示`}
      >
        i
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-[22rem] rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-black text-slate-900">{title}</p>
              <p className="mt-1 leading-6 text-slate-600">{note}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full px-2 py-1 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              aria-label="説明を閉じる"
            >
              閉じる
            </button>
          </div>
          <dl className="mt-4 space-y-3">
            {rows.map((row) => (
              <div
                key={row.label}
                className="grid gap-1 rounded-lg bg-slate-50 px-3 py-2"
              >
                <dt className="text-xs font-black uppercase tracking-wide text-blue-700">
                  {row.label}
                </dt>
                <dd className="text-sm leading-6 text-slate-700">
                  {row.description}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
function Field({
  label,
  name,
  error,
  children,
}: {
  label: string;
  name?: SubscriptionFieldName;
  error?: string[];
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      {label}
      {children}
      {error?.map((message) => (
        <span key={message} id={name ? `${name}-error` : undefined} className="text-sm font-bold text-red-700">{message}</span>
      ))}
    </label>
  );
}

function BudgetPreview({
  monthlyBudget,
  projectedMonthlyTotal,
}: {
  monthlyBudget: number;
  projectedMonthlyTotal: number;
}) {
  const formatter = new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  });
  const difference = projectedMonthlyTotal - monthlyBudget;
  const exceeded = difference > 0;
  return (
    <div
      className={`rounded-lg border p-4 text-sm font-semibold md:col-span-2 ${exceeded ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-100 bg-emerald-50 text-emerald-900"}`}
    >
      <p>登録後の月額換算合計: {formatter.format(projectedMonthlyTotal)}</p>
      <p className="mt-1">
        予算 {formatter.format(monthlyBudget)} /{" "}
        {exceeded
          ? `超過 ${formatter.format(difference)}`
          : `残り ${formatter.format(Math.abs(difference))}`}
      </p>
      <p className="mt-2 text-xs">予算を超えていても、登録はできます。</p>
    </div>
  );
}

export function RenewalDecisionForm({
  subscriptionId,
  renewalDate,
  currentStatus,
  currentReason = "",
}: {
  subscriptionId: string;
  renewalDate: Date;
  currentStatus?: RenewalDecisionStatus;
  currentReason?: string;
}) {
  const router = useRouter();
  const [loadingStatus, setLoadingStatus] = useState<RenewalDecisionStatus | null>(null);
  const [reason, setReason] = useState(currentReason);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(status: RenewalDecisionStatus) {
    setLoadingStatus(status);
    setMessage("");
    setError("");
    try {
      await request("/api/saving-challenges", "PUT", {
        subscriptionId,
        status,
        reason,
      });
      setMessage("今月の更新判断を保存しました。最終見直し日にも反映しました。");
      router.refresh();
    } catch (err) {
      setError(userErrorMessage(err, "更新判断の保存に失敗しました。"));
    } finally {
      setLoadingStatus(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="font-semibold text-slate-600">対象更新日 {isoDate(renewalDate)}</p>
        {currentStatus && (
          <span className="rounded-full bg-blue-50 px-3 py-1 font-bold text-blue-800">
            今月は判断済み
          </span>
        )}
      </div>
      <Field label="判断メモ（任意）">
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={MAX_RENEWAL_DECISION_REASON_LENGTH}
          rows={2}
          className="input min-h-20 resize-y"
          placeholder="利用目的、代替できない理由、次回確認する条件など"
        />
      </Field>
      <div className="grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          disabled={loadingStatus !== null}
          onClick={() => save("CONTINUE")}
          className="btn-secondary min-h-11 justify-center"
        >
          {loadingStatus === "CONTINUE" ? "保存中..." : "継続する"}
        </button>
        <button
          type="button"
          disabled={loadingStatus !== null}
          onClick={() => save("HOLD")}
          className="btn-secondary min-h-11 justify-center"
        >
          {loadingStatus === "HOLD" ? "保存中..." : "再検討する"}
        </button>
        <button
          type="button"
          disabled={loadingStatus !== null}
          onClick={() => save("CANCEL_PLANNED")}
          className="btn-primary min-h-11 justify-center"
        >
          {loadingStatus === "CANCEL_PLANNED" ? "保存中..." : "解約を検討"}
        </button>
      </div>
      {message && (
        <p className="text-sm font-semibold text-emerald-700">{message}</p>
      )}
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
    </div>
  );
}

export function MonthlyCloseButton({
  completedAt,
  unresolvedCount,
}: {
  completedAt: string | null;
  unresolvedCount: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function closeMonth() {
    if (
      unresolvedCount > 0
      && !window.confirm(
        `未解決項目が${unresolvedCount}件あります。現在の状態を月次締めとして記録しますか？`,
      )
    ) {
      return;
    }
    if (
      unresolvedCount === 0 &&
      completedAt &&
      !window.confirm(
        "現在の支払い・見直し状況で月次締めの集計を更新しますか？",
      )
    ) {
      return;
    }
    setLoading(true);
    setMessage("");
    setError("");
    try {
      await request("/api/monthly-close", "PUT");
      setMessage(
        completedAt
          ? "月次締めの集計を更新しました。"
          : "今月の見直しを完了しました。",
      );
      router.refresh();
    } catch (err) {
      setError(userErrorMessage(err, "月次締めの保存に失敗しました。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="print-hidden">
      <button
        type="button"
        onClick={closeMonth}
        disabled={loading}
        className="btn-primary min-h-11 justify-center"
      >
        {loading
          ? "保存中..."
          : unresolvedCount > 0
            ? completedAt
              ? "未解決を確認して更新"
              : "未解決を確認して締める"
            : completedAt
              ? "現在の集計で更新"
              : "今月の見直しを完了"}
      </button>
      {message && (
        <p className="mt-3 text-sm font-semibold text-emerald-700">{message}</p>
      )}
      {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
    </div>
  );
}

export function DailyUsageCheckButtons({
  id,
  compact = false,
  usedToday = false,
}: {
  id: string;
  compact?: boolean;
  usedToday?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"used" | "rarely" | "">("");
  const [hasUsedToday, setHasUsedToday] = useState(usedToday);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function checkUsageToday() {
    setMessage("");
    setError("");
    if (hasUsedToday && !window.confirm("今日の利用記録を取り消しますか？"))
      return;
    setLoading("used");
    try {
      const result = await request(
        `/api/subscriptions/${id}/usage/today`,
        hasUsedToday ? "DELETE" : "PUT",
      );
      const nextUsedToday = result.usedToday ?? !hasUsedToday;
      setHasUsedToday(nextUsedToday);
      setMessage(
        nextUsedToday
          ? "今日の利用を記録しました。"
          : "今日の利用記録を取り消しました。",
      );
      router.refresh();
    } catch (err) {
      setError(userErrorMessage(err, "使用状況の記録に失敗しました。"));
    } finally {
      setLoading("");
    }
  }

  async function checkRarelyUsed() {
    setMessage("");
    setError("");
    setLoading("rarely");
    try {
      await request(`/api/subscriptions/${id}`, "PATCH", {
        reviewed: true,
        usageFrequency: "RARELY",
      });
      setMessage("最近使っていない候補にしました。");
      router.refresh();
    } catch (err) {
      setError(userErrorMessage(err, "使用状況の記録に失敗しました。"));
    } finally {
      setLoading("");
    }
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={Boolean(loading)}
          onClick={checkUsageToday}
          className="btn-primary min-h-11 px-3 py-2 text-sm"
        >
          {loading === "used"
            ? "記録中..."
            : hasUsedToday
              ? "使用済み ✓"
              : "今日使った"}
        </button>
        <button
          type="button"
          disabled={Boolean(loading)}
          onClick={checkRarelyUsed}
          className="btn-secondary min-h-11 px-3 py-2 text-sm"
        >
          {loading === "rarely" ? "記録中..." : "最近使ってない"}
        </button>
      </div>
      {message && (
        <p className="text-xs font-semibold text-emerald-700">{message}</p>
      )}
      {error && <p className="text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}

export function WeeklyReviewButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<WeeklyUsageRange | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function completeReview(usageRange: WeeklyUsageRange) {
    setLoading(usageRange);
    setMessage("");
    setError("");
    try {
      await request(`/api/subscriptions/${id}/usage/weekly`, "PUT", {
        usageRange,
      });
      setMessage("今週の利用日数を保存しました。");
      router.refresh();
    } catch (err) {
      setError(userErrorMessage(err, "確認の保存に失敗しました。"));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {weeklyUsageRangeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={loading !== null}
            onClick={() => completeReview(option.value)}
            className="btn-secondary min-h-11 justify-center px-3 py-2 text-sm"
          >
            {loading === option.value ? "保存中..." : option.label}
          </button>
        ))}
      </div>
      {message && (
        <p className="text-xs font-semibold text-emerald-700">{message}</p>
      )}
      {error && <p className="text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}

export function SubscriptionActions({ id }: { id: string }) {
  const router = useRouter();
  return (
    <div className="grid gap-3">
      <button
        onClick={async () => {
          await request(`/api/subscriptions/${id}`, "PATCH", {
            reviewed: true,
          });
          router.refresh();
        }}
        className="btn-primary w-full"
      >
        見直し済みにする
      </button>
      <button
        onClick={async () => {
          await request(`/api/subscriptions/${id}`, "PATCH", {
            status: "CANCELLED",
          });
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
        const formElement = event.currentTarget;

        const form = new FormData(formElement);
        try {
          await request(
            "/api/categories",
            "POST",
            Object.fromEntries(form.entries()),
          );
          formElement.reset();
          router.refresh();
        } catch (err) {
          setError(userErrorMessage(err, "追加に失敗しました。"));
        }
      }}
      noValidate
      className="space-y-4"
    >
      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      <Field label="カテゴリ名">
        <input
          name="name"
          className="input"
          maxLength={MAX_CATEGORY_NAME_LENGTH}
          required
        />
      </Field>
      <Field label="色">
        <input
          name="color"
          type="color"
          defaultValue="#2563eb"
          className="h-12 w-20 rounded border border-slate-200"
          required
        />
      </Field>
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
        const formElement = event.currentTarget;

        const form = new FormData(formElement);
        try {
          await request(
            "/api/payment-methods",
            "POST",
            Object.fromEntries(form.entries()),
          );
          formElement.reset();
          router.refresh();
        } catch (err) {
          setError(userErrorMessage(err, "追加に失敗しました。"));
        }
      }}
      noValidate
      className="space-y-4"
    >
      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      <Field label="名前">
        <input
          name="name"
          className="input"
          maxLength={MAX_PAYMENT_METHOD_NAME_LENGTH}
          required
        />
      </Field>
      <Field label="種別">
        <select name="type" className="input" required>
          {stripePaymentMethodOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="メモ">
        <textarea
          name="memo"
          className="input"
          maxLength={MAX_PAYMENT_METHOD_MEMO_LENGTH}
        />
      </Field>
      <button className="btn-primary">追加</button>
    </form>
  );
}

export function CsvDownloadButton({ disabled }: { disabled: boolean }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <a
        href={disabled ? undefined : "/api/export"}
        aria-disabled={disabled}
        onClick={(event) => {
          if (disabled) event.preventDefault();
        }}
        className={`btn-primary ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        CSVをダウンロード
      </a>
      <CsvHelpPopover
        title="CSV出力の見方"
        note="出力されるCSVは1行目がヘッダです。列の意味を確認して、そのまま別の表計算ソフトに取り込めます。"
        rows={[
          { label: "サービス名", description: "登録済みのサービス名です。" },
          { label: "金額", description: "請求金額です。" },
          {
            label: "請求周期",
            description: "月額・年額・週額・カスタムの区分です。",
          },
          {
            label: "月額換算",
            description: "請求周期を月あたりに換算した金額です。",
          },
          {
            label: "年額換算",
            description: "請求周期を年あたりに換算した金額です。",
          },
          { label: "次回更新日", description: "次の請求予定日です。" },
          { label: "カテゴリ", description: "設定しているカテゴリ名です。" },
          {
            label: "支払い方法",
            description: "設定している支払い方法名です。",
          },
          { label: "請求元", description: "直接契約、App Store、Google Playなど、契約を管理する事業者です。" },
          { label: "請求通貨", description: "実際の請求書に記載された通貨です。" },
          { label: "原通貨額", description: "外貨で請求された元の金額です。JPYでは空欄です。" },
          { label: "円換算レート", description: "1通貨あたりの円換算レートです。" },
          { label: "換算レート確認日", description: "換算レートを確認した日付です。" },
          {
            label: "ステータス",
            description: "有効・停止中・解約済みなどの状態です。",
          },
          { label: "メモ", description: "登録されている補足メモです。" },
        ]}
      />
    </div>
  );
}

export function ProfileSettingsForm({
  name,
  email,
}: {
  name: string;
  email: string;
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
    const formElement = event.currentTarget;

    const form = new FormData(formElement);
    try {
      await request(
        "/api/settings/profile",
        "PUT",
        Object.fromEntries(form.entries()),
      );
      setMessage("プロフィールを更新しました。");
      router.refresh();
    } catch (err) {
      setError(userErrorMessage(err, "更新に失敗しました。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="名前">
        <input
          name="name"
          defaultValue={name}
          className="input"
          maxLength={MAX_USER_NAME_LENGTH}
          required
        />
      </Field>
      <Field label="メールアドレス">
        <input
          value={email}
          className="input bg-slate-100 text-slate-500"
          disabled
        />
      </Field>
      {message && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      <button disabled={loading} className="btn-primary">
        {loading ? "保存中..." : "プロフィールを保存"}
      </button>
    </form>
  );
}

export function EmailSettingsForm({ email }: { email: string }) {
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
      const data = (await request(
        "/api/settings/email",
        "POST",
        Object.fromEntries(form.entries()),
      )) as { message?: string };
      setMessage(data.message ?? "確認メールを送りました。");
    } catch (err) {
      setError(userErrorMessage(err, "確認メールを送信できませんでした。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm leading-6 text-slate-600">
        現在のメールアドレス:{" "}
        <span className="font-semibold text-slate-800">{email}</span>
      </p>
      <Field label="新しいメールアドレス">
        <input
          name="email"
          className="input"
          type="email"
          autoComplete="email"
          maxLength={MAX_EMAIL_LENGTH}
          required
        />
      </Field>
      <p className="text-xs leading-5 text-slate-500">
        新しいメールアドレスに届く確認リンクを開くまで、変更は反映されません。Premium契約中は、認証完了後にStripeの請求先メールも更新します。
      </p>
      {message && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      <button disabled={loading} className="btn-secondary">
        {loading ? "確認メールを送信中..." : "確認メールを送信"}
      </button>
    </form>
  );
}

export function PlanSettingsForm({
  plan,
  stripeTestMode,
  canManageStripe,
  protectedAccount = false,
}: {
  plan: "FREE" | "PREMIUM" | "LIFETIME";
  stripeTestMode?: boolean;
  canManageStripe: boolean;
  protectedAccount?: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [requiresPaidConfirmation, setRequiresPaidConfirmation] =
    useState(false);
  const [loading, setLoading] = useState<"checkout" | "portal" | "sync" | "">(
    "",
  );
  const paidPlan = plan === "PREMIUM" || plan === "LIFETIME";

  const stripeManaged = !protectedAccount && (paidPlan || canManageStripe);
  const canStartCheckout = !protectedAccount && plan === "FREE" && !canManageStripe;
  const labels = {
    currentPlan: "\u73fe\u5728\u306e\u30d7\u30e9\u30f3",
    freeDescription:
      "\u30b5\u30d6\u30b9\u30af10\u4ef6\u3001\u30ab\u30c6\u30b4\u30ea5\u4ef6\u307e\u3067\u7ba1\u7406\u3067\u304d\u307e\u3059\u3002\u57fa\u672c\u30c0\u30c3\u30b7\u30e5\u30dc\u30fc\u30c9\u3001\u30ab\u30ec\u30f3\u30c0\u30fc\u3001\u901a\u77e5\u30c1\u30a7\u30c3\u30af\u3092\u5229\u7528\u3067\u304d\u307e\u3059\u3002",
    premiumDescription:
      "\u30b5\u30d6\u30b9\u30af\u7121\u5236\u9650\u3001CSV\u5165\u51fa\u529b\u3001\u660e\u7d30\u691c\u51fa\u3001\u9ad8\u5ea6\u306a\u5206\u6790\u3001\u6708\u6b21\u30ec\u30dd\u30fc\u30c8\u3001\u89e3\u7d04\u652f\u63f4\u3092\u5229\u7528\u3067\u304d\u307e\u3059\u3002",
    stripeTestTitle:
      "Stripe\u30c6\u30b9\u30c8\u30e2\u30fc\u30c9\u304c\u6709\u52b9\u3067\u3059",
    stripeCardNote: "Stripe Checkout\u3067\u306f\u30ab\u30fc\u30c9\u756a\u53f7",
    stripeCardAfter:
      "\u3092\u4f7f\u7528\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
    stripeExtraNote:
      "\u6709\u52b9\u671f\u9650\u306f\u672a\u6765\u65e5\u3001CVC\u306f\u4efb\u610f\u306e3\u6841\u3001\u6c0f\u540d\u30fb\u4f4f\u6240\u30fb\u90f5\u4fbf\u756a\u53f7\u306f\u4efb\u610f\u306e\u30c6\u30b9\u30c8\u5024\u3067\u5165\u529b\u3067\u304d\u307e\u3059\u3002",
    stripeNoCharge:
      "Stripe\u306e\u30c6\u30b9\u30c8\u30ad\u30fc\u3092\u4f7f\u7528\u3057\u3066\u3044\u308b\u9593\u3001\u5b9f\u969b\u306e\u8acb\u6c42\u306f\u767a\u751f\u3057\u307e\u305b\u3093\u3002",
    manageTitle: "\u5951\u7d04\u7ba1\u7406\u30fb\u89e3\u7d04",
    manageDescription:
      "\u89e3\u7d04\u3001\u652f\u6255\u3044\u65b9\u6cd5\u306e\u5909\u66f4\u3001\u9818\u53ce\u66f8\u306e\u78ba\u8a8d\u306f\u300c\u5951\u7d04\u7ba1\u7406\u30fb\u89e3\u7d04\uff08Stripe\uff09\u3092\u958b\u304f\u300d\u304b\u3089\u884c\u3048\u307e\u3059\u3002",
    stripeOpening: "Stripe\u3092\u958b\u3044\u3066\u3044\u307e\u3059...",
    premiumApplied: "Premium\u9069\u7528\u6e08\u307f",
    portalButton:
      "\u5951\u7d04\u7ba1\u7406\u30fb\u89e3\u7d04\uff08Stripe\uff09\u3092\u958b\u304f",
    syncing: "\u78ba\u8a8d\u4e2d...",
    syncButton: "\u8ab2\u91d1\u72b6\u614b\u3092\u518d\u78ba\u8a8d",
    syncFailed:
      "\u8ab2\u91d1\u72b6\u614b\u306e\u78ba\u8a8d\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002",
    syncDone:
      "\u8ab2\u91d1\u72b6\u614b\u3092\u78ba\u8a8d\u3057\u307e\u3057\u305f\u3002",
    checkoutNote:
      "\u6c7a\u6e08\u5b8c\u4e86\u5f8c\u306bPremium\u8868\u793a\u3078\u5207\u308a\u66ff\u308f\u3089\u306a\u3044\u5834\u5408\u306f\u300c\u8ab2\u91d1\u72b6\u614b\u3092\u518d\u78ba\u8a8d\u300d\u3092\u62bc\u3057\u3066\u304f\u3060\u3055\u3044\u3002\u901a\u5e38\u306fCheckout\u5b8c\u4e86\u5f8c\u307e\u305f\u306fWebhook\u53d7\u4fe1\u6642\u306b\u81ea\u52d5\u3067\u53cd\u6620\u3055\u308c\u307e\u3059\u3002",
  } as const;

  async function openStripe(
    path: "/api/stripe/checkout" | "/api/stripe/portal",
    mode: "checkout" | "portal",
    confirmWithoutTrial = false,
  ) {
    setMessage("");
    setError("");
    setLoading(mode);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmWithoutTrial }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        url?: string;
        message?: string;
        code?: string;
      };
      if (data.code === "TRIAL_ALREADY_USED") {
        setRequiresPaidConfirmation(true);
        setError(data.message ?? labels.stripeOpening);
        setLoading("");
        return;
      }
      if (!response.ok || !data.url)
        throw new Error(data.message ?? labels.stripeOpening);
      window.location.assign(data.url);
    } catch (err) {
      setError(userErrorMessage(err, labels.stripeOpening));
      setLoading("");
    }
  }

  async function syncBilling() {
    setMessage("");
    setError("");
    setLoading("sync");
    try {
      const response = await fetch("/api/stripe/sync", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        attention?: boolean;
      };
      if (!response.ok) throw new Error(data.message ?? labels.syncFailed);
      if (data.attention) {
        setError(data.message ?? labels.syncFailed);
        router.refresh();
        return;
      }
      setMessage(data.message ?? labels.syncDone);
      router.refresh();
    } catch (err) {
      setError(userErrorMessage(err, labels.syncFailed));
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
            {plan === "FREE" && (
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">
                {labels.currentPlan}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {labels.freeDescription}
          </p>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50/80 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 font-bold text-blue-900">
              <span className="block">Premium</span>
              <span className="mt-0.5 block whitespace-nowrap text-sm">
                月額{PREMIUM_MONTHLY_PRICE_YEN}円
              </span>
            </p>
            {paidPlan && (
              <span className="shrink-0 rounded-full bg-blue-100 px-2 py-1 text-xs font-black text-blue-700">
                {labels.currentPlan}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm font-black text-blue-800">
            初回のみ{STRIPE_TRIAL_PERIOD_DAYS}
            日間お試し無料。無料期間中に解約すれば料金はかかりません。
          </p>
          <p className="mt-2 text-sm text-blue-800">
            {labels.premiumDescription}
          </p>
        </div>
      </div>
      {stripeTestMode && !protectedAccount && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <p className="font-black">{labels.stripeTestTitle}</p>
          <p>
            {labels.stripeCardNote}{" "}
            <span className="font-mono font-bold">4242 4242 4242 4242</span>{" "}
            {labels.stripeCardAfter}
          </p>
          <p>{labels.stripeExtraNote}</p>
          <p>{labels.stripeNoCharge}</p>
        </div>
      )}
      {message && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      {requiresPaidConfirmation && canStartCheckout && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <p className="font-black">無料体験なしで開始する場合</p>
          <p>本日から月額{PREMIUM_MONTHLY_PRICE_YEN}円の請求対象になります。</p>
          <button
            type="button"
            disabled={Boolean(loading)}
            onClick={() =>
              openStripe("/api/stripe/checkout", "checkout", true)
            }
            className="btn-secondary mt-3"
          >
            内容を確認して月額{PREMIUM_MONTHLY_PRICE_YEN}円で開始
          </button>
        </div>
      )}
      {stripeManaged && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
          <p className="font-black">{labels.manageTitle}</p>
          <p>{labels.manageDescription}</p>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {canStartCheckout ? (
          <form
            action="/api/stripe/checkout"
            method="POST"
            onSubmit={(event) => {
              event.preventDefault();
              void openStripe("/api/stripe/checkout", "checkout");
            }}
          >
            <button
              type="submit"
              disabled={Boolean(loading)}
              className="btn-primary"
            >
              {loading === "checkout"
                ? labels.stripeOpening
                : `Premiumに加入（初回${STRIPE_TRIAL_PERIOD_DAYS}日間無料・月額${PREMIUM_MONTHLY_PRICE_YEN}円）`}
            </button>
          </form>
        ) : (
          <button type="button" disabled className="btn-primary opacity-80">
            {paidPlan ? labels.premiumApplied : "Premium支払い要確認"}
          </button>
        )}
        {stripeManaged && (
          <button
            type="button"
            disabled={Boolean(loading)}
            onClick={() => openStripe("/api/stripe/portal", "portal")}
            className="btn-secondary"
          >
            {loading === "portal" ? labels.stripeOpening : labels.portalButton}
          </button>
        )}
        {!protectedAccount && (
          <button
            type="button"
            disabled={Boolean(loading)}
            onClick={syncBilling}
            className="btn-secondary"
          >
            {loading === "sync" ? labels.syncing : labels.syncButton}
          </button>
        )}
      </div>
      {protectedAccount && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-700">
          デモ・管理者の保護アカウントでは、Stripeの契約操作と請求は行いません。
        </p>
      )}
      {!protectedAccount && <p className="text-xs leading-5 text-slate-500">{labels.checkoutNote}</p>}
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
    const formElement = event.currentTarget;

    const form = new FormData(formElement);
    const newPassword = String(form.get("newPassword") ?? "");
    const newPasswordConfirm = String(form.get("newPasswordConfirm") ?? "");
    if (newPassword !== newPasswordConfirm) {
      setError("新しいパスワードと確認用パスワードが一致しません。");
      return;
    }

    setLoading(true);
    try {
      await request(
        "/api/settings/password",
        "PUT",
        Object.fromEntries(form.entries()),
      );
      formElement.reset();
      setMessage("パスワードを変更しました。");
    } catch (err) {
      setError(userErrorMessage(err, "パスワード変更に失敗しました。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="現在のパスワード">
        <input
          name="currentPassword"
          className="input"
          type="password"
          required
        />
      </Field>
      <Field label="新しいパスワード">
        <input
          name="newPassword"
          className="input"
          type="password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </Field>
      <Field label="新しいパスワード（確認）">
        <input
          name="newPasswordConfirm"
          className="input"
          type="password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </Field>
      {message && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      <button disabled={loading} className="btn-primary">
        {loading ? "変更中..." : "パスワードを変更"}
      </button>
    </form>
  );
}

export function AccountDeleteForm({ email }: { email: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);
    const formElement = event.currentTarget;

    const form = new FormData(formElement);
    const confirmText = String(form.get("confirmText") ?? "");
    if (confirmText !== "削除する") {
      setError("確認のため「削除する」と入力してください。");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/settings/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!response.ok)
        throw new Error(data.message ?? "アカウント削除に失敗しました。");
      formElement.reset();
      setMessage("アカウントを削除しました。ログイン画面へ移動します。");
      router.replace("/login");
    } catch (err) {
      setError(userErrorMessage(err, "アカウント削除に失敗しました。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <input type="hidden" name="email" value={email} />
      <Field label="現在のパスワード">
        <input
          name="currentPassword"
          className="input"
          type="password"
          required
        />
      </Field>
      <Field label="確認入力">
        <input
          name="confirmText"
          className="input"
          type="text"
          placeholder="削除する"
          required
        />
      </Field>
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900">
        <p className="font-black">完全削除</p>
        <p className="mt-1">
          この操作で、アカウントに紐づくデータをDBから完全に削除します。取り消しはできません。継続中のPremium契約がある場合は、先に契約管理で解約を完了してください。
        </p>
      </div>
      {message && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      <button disabled={loading} className="btn-danger">
        {loading ? "削除中..." : "アカウントを完全削除"}
      </button>
    </form>
  );
}

export function StatementMerchantAliasesForm({
  subscriptionId,
  aliases,
  canAdd,
}: {
  subscriptionId: string;
  aliases: Array<{ id: string; merchantLabel: string }>;
  canAdd: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function addAlias(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");
    const form = event.currentTarget;
    const merchant = String(new FormData(form).get("merchant") ?? "");
    try {
      const result = await request(
        `/api/subscriptions/${subscriptionId}/statement-aliases`,
        "POST",
        { merchant },
      );
      form.reset();
      setMessage(result.created === false
        ? "この明細名義は登録済みです。"
        : "明細名義ルールを追加しました。");
      router.refresh();
    } catch (err) {
      setError(userErrorMessage(err, "明細名義ルールの追加に失敗しました。"));
    } finally {
      setLoading(false);
    }
  }

  async function removeAlias(aliasId: string) {
    if (!window.confirm("この明細名義ルールを削除しますか？")) return;
    setDeletingId(aliasId);
    setMessage("");
    setError("");
    try {
      await request(
        `/api/subscriptions/${subscriptionId}/statement-aliases`,
        "DELETE",
        { aliasId },
      );
      setMessage("明細名義ルールを削除しました。");
      router.refresh();
    } catch (err) {
      setError(userErrorMessage(err, "明細名義ルールの削除に失敗しました。"));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-blue-700">STATEMENT RULES</p>
          <h2 className="mt-1 text-lg font-bold">カード・銀行明細の名義ルール</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            実際の明細名義を契約へ結び付けると、次回のCSV取込で優先提案します。全角半角、記号、明細番号の違いは照合時に吸収します。
          </p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-black text-blue-800">
          {aliases.length}/{MAX_STATEMENT_MERCHANT_ALIASES_PER_SUBSCRIPTION}件
        </span>
      </div>
      <div className="mt-4 divide-y divide-slate-100 border-y border-slate-100">
        {aliases.map((alias) => (
          <div key={alias.id} className="flex items-center justify-between gap-3 py-3">
            <p className="min-w-0 break-words text-sm font-bold text-slate-800">{alias.merchantLabel}</p>
            <button
              type="button"
              onClick={() => removeAlias(alias.id)}
              disabled={deletingId !== null}
              className="btn-danger shrink-0"
            >
              {deletingId === alias.id ? "名義ルールを削除中..." : "名義ルールを削除"}
            </button>
          </div>
        ))}
        {aliases.length === 0 && <p className="py-4 text-sm font-semibold text-slate-500">明細名義ルールはまだありません。</p>}
      </div>
      {canAdd ? (
        <form onSubmit={addAlias} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="カード・銀行明細に表示される名義">
            <input
              name="merchant"
              className="input"
              minLength={MIN_STATEMENT_MERCHANT_ALIAS_LENGTH}
              maxLength={MAX_STATEMENT_MERCHANT_LABEL_LENGTH}
              placeholder="OPENAI*CHATGPT、APPLE.COM/BILLなど"
              required
            />
          </Field>
          <button
            disabled={loading || aliases.length >= MAX_STATEMENT_MERCHANT_ALIASES_PER_SUBSCRIPTION}
            className="btn-primary"
          >
            {loading ? "追加中..." : "名義ルールを追加"}
          </button>
        </form>
      ) : (
        <p className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm font-bold text-blue-900">
          新しい明細名義ルールの追加はPremium限定です。保存済みルールの削除は引き続き行えます。
        </p>
      )}
      {message && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p>}
      {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
    </div>
  );
}

export function PaymentHistoryForm({
  subscriptionId,
  subscriptions,
  defaultAmount,
  defaultAccountingLabel,
}: {
  subscriptionId?: string;
  subscriptions?: Array<{ id: string; name: string; price: number; defaultAccountingLabel: string | null }>;
  defaultAmount?: number;
  defaultAccountingLabel?: string | null;
}) {
  const router = useRouter();
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState(subscriptionId ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const selectedSubscription = subscriptions?.find(
    (item) => item.id === selectedSubscriptionId,
  );
  const selectedAmount = defaultAmount ?? selectedSubscription?.price ?? "";
  const selectedAccountingLabel =
    defaultAccountingLabel ?? selectedSubscription?.defaultAccountingLabel ?? "";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);
    const formElement = event.currentTarget;

    const form = new FormData(formElement);
    try {
      await requestPaymentHistoryWithDuplicateConfirmation(
        "/api/payment-histories",
        "POST",
        Object.fromEntries(form.entries()),
      );
      formElement.reset();
      setMessage("支払い履歴を登録しました。");
      router.refresh();
    } catch (err) {
      setError(userErrorMessage(err, "支払い履歴の登録に失敗しました。"));
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
          <select
            name="subscriptionId"
            value={selectedSubscriptionId}
            onChange={(event) => setSelectedSubscriptionId(event.target.value)}
            className="input"
            required
          >
            <option value="">選択してください</option>
            {(subscriptions ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="支払い金額">
        <input
          key={`amount-${selectedSubscriptionId}-${selectedAmount}`}
          name="amount"
          type="number"
          defaultValue={selectedAmount}
          className="input"
          min={0}
          max={MAX_SUBSCRIPTION_PRICE}
          required
        />
      </Field>
      <Field label="支払い日">
        <input
          name="paidAt"
          type="date"
          defaultValue={isoDate(new Date())}
          className="input"
          required
        />
      </Field>
      <Field label="整理用科目（任意）">
        <input
          key={`accounting-${selectedSubscriptionId}-${selectedAccountingLabel}`}
          name="accountingLabel"
          className="input"
          maxLength={MAX_ACCOUNTING_LABEL_LENGTH}
          placeholder="通信費、支払手数料など"
          defaultValue={selectedAccountingLabel}
        />
      </Field>
      <label className="flex min-h-12 items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 md:col-span-2">
        <input type="hidden" name="rememberAccountingLabel" value="false" />
        <input
          name="rememberAccountingLabel"
          type="checkbox"
          value="true"
          className="mt-0.5 size-5 accent-blue-600"
        />
        <span>
          <span className="block text-sm font-bold text-slate-800">この科目を次回以降の初期値にする</span>
          <span className="mt-1 block text-xs font-medium leading-5 text-slate-500">契約に保存し、次回の支払い登録と明細CSV取込へ引き継ぎます。税務上の扱いは必要に応じて税理士等へ確認してください。</span>
        </span>
      </label>
      <Field label="領収書・請求書番号（任意）">
        <input
          name="referenceNumber"
          className="input"
          maxLength={MAX_PAYMENT_REFERENCE_NUMBER_LENGTH}
          placeholder="領収書や請求書の管理番号"
        />
      </Field>
      <label className="grid gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
        証憑URL（任意）
        <input
          name="referenceUrl"
          type="url"
          className="input"
          maxLength={MAX_URL_LENGTH}
          placeholder="https://"
        />
        <span className="text-xs font-medium leading-5 text-slate-500">領収書・請求書を保管した外部サービスのURLを記録できます。</span>
      </label>
      <label className="grid gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
        メモ
        <textarea
          name="memo"
          className="input min-h-28"
          maxLength={MAX_PAYMENT_HISTORY_MEMO_LENGTH}
          placeholder="カード明細名、確認メモなど"
        />
      </label>
      {message && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 md:col-span-2">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700 md:col-span-2">
          {error}
        </p>
      )}
      <div className="md:col-span-2">
        <button disabled={loading} className="btn-primary">
          {loading ? "登録中..." : "支払いを記録"}
        </button>
      </div>
    </form>
  );
}

type EditablePaymentHistory = {
  id: string;
  amount: number;
  paidAt: Date | string;
  accountingLabel: string | null;
  referenceNumber: string | null;
  referenceUrl: string | null;
  memo: string | null;
};

export function PaymentHistoryEditForm({ history }: { history: EditablePaymentHistory }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);
    try {
      const form = new FormData(event.currentTarget);
      await requestPaymentHistoryWithDuplicateConfirmation(`/api/payment-histories/${history.id}`, "PATCH", Object.fromEntries(form.entries()));
      setMessage("支払い履歴を更新しました。");
      router.refresh();
    } catch (err) {
      setError(userErrorMessage(err, "支払い履歴の更新に失敗しました。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <details className="mt-3 rounded-lg border border-slate-200 bg-white/75">
      <summary className="cursor-pointer px-3 py-2 text-sm font-bold text-blue-700">記録を修正</summary>
      <form onSubmit={submit} noValidate className="grid gap-3 border-t border-slate-100 p-3 md:grid-cols-2">
        <Field label="支払い金額">
          <input name="amount" type="number" defaultValue={history.amount} className="input" min={0} max={MAX_SUBSCRIPTION_PRICE} required />
        </Field>
        <Field label="支払い日">
          <input name="paidAt" type="date" defaultValue={isoDate(new Date(history.paidAt))} className="input" required />
        </Field>
        <Field label="整理用科目（任意）">
          <input name="accountingLabel" defaultValue={history.accountingLabel ?? ""} className="input" maxLength={MAX_ACCOUNTING_LABEL_LENGTH} />
        </Field>
        <Field label="領収書・請求書番号（任意）">
          <input name="referenceNumber" defaultValue={history.referenceNumber ?? ""} className="input" maxLength={MAX_PAYMENT_REFERENCE_NUMBER_LENGTH} />
        </Field>
        <label className="grid gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
          証憑URL（任意）
          <input name="referenceUrl" type="url" defaultValue={history.referenceUrl ?? ""} className="input" maxLength={MAX_URL_LENGTH} placeholder="https://" />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
          メモ
          <textarea name="memo" defaultValue={history.memo ?? ""} className="input min-h-24" maxLength={MAX_PAYMENT_HISTORY_MEMO_LENGTH} />
        </label>
        {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 md:col-span-2">{message}</p>}
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700 md:col-span-2">{error}</p>}
        <div className="md:col-span-2">
          <button disabled={loading} className="btn-primary min-h-0 px-4 py-2 text-sm">{loading ? "更新中..." : "変更を保存"}</button>
        </div>
      </form>
    </details>
  );
}

export function DeletePaymentHistoryButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <button
      disabled={loading}
      onClick={async () => {
        if (!window.confirm("この支払い履歴を削除しますか？")) return;
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
    const formElement = event.currentTarget;

    const form = new FormData(formElement);
    try {
      await request(
        `/api/subscriptions/${id}`,
        "PATCH",
        Object.fromEntries(form.entries()),
      );
      setMessage("解約支援の状態を更新しました。");
      router.refresh();
    } catch (err) {
      setError(userErrorMessage(err, "更新に失敗しました。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="解約ステータス">
        <select
          name="cancellationStatus"
          defaultValue={status}
          className="input"
        >
          <option value="NONE">未着手</option>
          <option value="CONSIDERING">検討中</option>
          <option value="PLANNED">解約予定</option>
          <option value="REQUESTED">解約申請済み</option>
          <option value="COMPLETED">解約完了</option>
        </select>
      </Field>
      <Field label="解約予定日">
        <input
          name="plannedCancelAt"
          type="date"
          defaultValue={dateValue(plannedCancelAt)}
          className="input"
        />
      </Field>
      <Field label="解約メモ">
        <textarea
          name="cancellationMemo"
          defaultValue={memo ?? ""}
          className="input min-h-24"
          maxLength={MAX_MEMO_LENGTH}
          placeholder="問い合わせ番号、解約手順、次に確認することなど"
        />
      </Field>
      {message && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      <button disabled={loading} className="btn-primary w-full">
        {loading ? "更新中..." : "解約支援を更新"}
      </button>
    </form>
  );
}

export function BudgetSettingsForm({
  monthlyBudget,
  defaultNotifyDaysBefore,
  notificationHour,
  monthlyDigestEnabled,
}: {
  monthlyBudget?: number | null;
  defaultNotifyDaysBefore: number;
  notificationHour: number;
  monthlyDigestEnabled: boolean;
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
    const formElement = event.currentTarget;

    const form = new FormData(formElement);
    try {
      const values = Object.fromEntries(form.entries());
      await request(
        "/api/settings/budget",
        "PUT",
        { ...values, monthlyDigestEnabled: form.has("monthlyDigestEnabled") },
      );
      setMessage("予算と通知設定を更新しました。");
      router.refresh();
    } catch (err) {
      setError(userErrorMessage(err, "更新に失敗しました。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="月額サブスク予算">
        <input
          name="monthlyBudget"
          type="number"
          defaultValue={monthlyBudget ?? ""}
          className="input"
          min={0}
          placeholder="例: 15000"
        />
      </Field>
      <Field label="標準通知日数">
        <input
          name="defaultNotifyDaysBefore"
          type="number"
          defaultValue={defaultNotifyDaysBefore}
          className="input"
          min={0}
          max={60}
          required
        />
      </Field>
      <Field label="通知時刻">
        <input
          name="notificationHour"
          type="number"
          defaultValue={notificationHour}
          className="input"
          min={0}
          max={23}
          required
        />
      </Field>
      <Field label="月次運用サマリー">
        <span className="flex min-h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
          <input
            name="monthlyDigestEnabled"
            type="checkbox"
            defaultChecked={monthlyDigestEnabled}
            className="size-5 accent-blue-600"
          />
          <span>
            <span className="block font-bold text-slate-800">毎月1日に運用サマリーを受け取る</span>
            <span className="mt-1 block text-xs font-medium leading-5 text-slate-500">Premiumの月額見込み、仕事利用分、予算差、更新・見直し件数をメールで確認できます。</span>
          </span>
        </span>
      </Field>
      {message && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      <button disabled={loading} className="btn-primary">
        {loading ? "保存中..." : "予算・通知を保存"}
      </button>
    </form>
  );
}

type CsvImportPreviewRow = {
  rowNumber: number;
  values: SubscriptionImportValues;
  valid: boolean;
  selected: boolean;
  issues: string[];
};

type CsvImportPreview = {
  hasHeader: boolean;
  rows: CsvImportPreviewRow[];
  validCount: number;
  invalidCount: number;
};

type CsvImportStage = "preview" | "revalidate" | "import";

const CSV_PRIMARY_REVIEW_HEADERS: readonly SubscriptionImportHeader[] = [
  "サービス名",
  "料金",
  "請求周期",
  "次回更新日",
  "カテゴリ",
  "支払い方法",
  "請求通貨",
];
const CSV_DETAIL_REVIEW_HEADERS = SUBSCRIPTION_IMPORT_HEADERS.filter(
  (header) => !CSV_PRIMARY_REVIEW_HEADERS.includes(header),
);

function csvReviewCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function csvReviewFile(rows: CsvImportPreviewRow[]) {
  const lines = [
    SUBSCRIPTION_IMPORT_HEADERS.map(csvReviewCell).join(","),
    ...rows.map((row) =>
      SUBSCRIPTION_IMPORT_HEADERS
        .map((header) => csvReviewCell(row.values[header]))
        .join(","),
    ),
  ];
  return new File(
    [`\uFEFF${lines.join("\n")}`],
    "subsclist-reviewed-import.csv",
    { type: "text/csv;charset=utf-8" },
  );
}

function CsvReviewField({
  header,
  value,
  onChange,
}: {
  header: SubscriptionImportHeader;
  value: string;
  onChange: (value: string) => void;
}) {
  const common = {
    value,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
    ) => onChange(event.target.value),
    className: "input min-w-0",
  };
  if (header === "請求周期") {
    return (
      <label className="grid gap-1 text-xs font-bold text-slate-600">
        {header}
        <select {...common}>
          <option value="MONTHLY">月額</option>
          <option value="QUARTERLY">3か月ごと</option>
          <option value="SEMIANNUAL">6か月ごと</option>
          <option value="YEARLY">年額</option>
          <option value="WEEKLY">週額</option>
          <option value="CUSTOM">カスタム</option>
        </select>
      </label>
    );
  }
  if (header === "請求通貨") {
    return (
      <label className="grid gap-1 text-xs font-bold text-slate-600">
        {header}
        <select {...common}>
          {SUBSCRIPTION_CURRENCIES.map((currency) => (
            <option key={currency} value={currency}>{currency}</option>
          ))}
        </select>
      </label>
    );
  }
  if (header === "請求元") {
    return (
      <label className="grid gap-1 text-xs font-bold text-slate-600">
        {header}
        <select {...common}>
          {BILLING_PROVIDER_VALUES.map((provider) => (
            <option key={provider} value={provider}>{billingProviderLabel(provider)}</option>
          ))}
        </select>
      </label>
    );
  }
  if (header === "メモ") {
    return (
      <label className="grid gap-1 text-xs font-bold text-slate-600">
        {header}
        <textarea {...common} rows={2} />
      </label>
    );
  }
  const dateField = ["次回更新日", "換算レート確認日"].includes(header);
  const numericField = ["料金", "カスタム周期日数", "仕事利用割合"].includes(header);
  return (
    <label className="grid gap-1 text-xs font-bold text-slate-600">
      {header}
      <input
        {...common}
        type={dateField ? "date" : numericField ? "number" : "text"}
        inputMode={header === "原通貨額" || header === "円換算レート" ? "decimal" : undefined}
      />
    </label>
  );
}

export function CsvImportForm({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [stage, setStage] = useState<CsvImportStage | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvImportPreview | null>(null);
  const selectedCount = preview?.rows.filter(
    (row) => row.valid && row.selected,
  ).length ?? 0;
  const currentValidCount = preview?.rows.filter((row) => row.valid).length ?? 0;
  const currentInvalidCount = (preview?.rows.length ?? 0) - currentValidCount;

  async function requestPreview(file: File, nextStage: CsvImportStage) {
    setMessage("");
    setError("");
    setStage(nextStage);
    const form = new FormData();
    form.set("file", file);
    try {
      const response = await fetch("/api/import/subscriptions/preview", {
        method: "POST",
        body: form,
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        hasHeader?: boolean;
        rows?: CsvImportPreviewRow[];
        validCount?: number;
        invalidCount?: number;
      };
      if (!response.ok || !data.rows) {
        throw new Error(data.message ?? "CSVの解析に失敗しました。");
      }
      setPreview({
        hasHeader: data.hasHeader ?? false,
        rows: data.rows,
        validCount: data.validCount ?? 0,
        invalidCount: data.invalidCount ?? 0,
      });
      setMessage(
        `${data.rows.length}行を解析しました。登録可能 ${data.validCount ?? 0}件、要修正 ${data.invalidCount ?? 0}件です。`,
      );
    } catch (err) {
      setError(userErrorMessage(err, "CSVの解析に失敗しました。"));
    } finally {
      setStage(null);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sourceFile) {
      setError("CSVファイルを選択してください。");
      return;
    }
    await requestPreview(sourceFile, "preview");
  }

  function updatePreviewValue(
    rowNumber: number,
    header: SubscriptionImportHeader,
    value: string,
  ) {
    setPreview((current) => current ? {
      ...current,
      rows: current.rows.map((row) => row.rowNumber === rowNumber
        ? {
            ...row,
            values: { ...row.values, [header]: value },
            valid: false,
            selected: false,
            issues: ["変更内容をサーバーで再検証してください。"],
          }
        : row),
    } : null);
  }

  function togglePreviewRow(rowNumber: number, selected: boolean) {
    setPreview((current) => current ? {
      ...current,
      rows: current.rows.map((row) => row.rowNumber === rowNumber
        ? { ...row, selected: row.valid && selected }
        : row),
    } : null);
  }

  function selectAllValid(selected: boolean) {
    setPreview((current) => current ? {
      ...current,
      rows: current.rows.map((row) => ({
        ...row,
        selected: row.valid && selected,
      })),
    } : null);
  }

  async function revalidatePreview() {
    if (!preview) return;
    await requestPreview(csvReviewFile(preview.rows), "revalidate");
  }

  async function importSelected(form: HTMLFormElement | null) {
    if (!preview) return;
    const rows = preview.rows.filter((row) => row.valid && row.selected);
    if (rows.length === 0) {
      setError("登録する行を1件以上選択してください。");
      return;
    }
    setMessage("");
    setError("");
    setStage("import");
    const body = new FormData();
    body.set("file", csvReviewFile(rows));
    try {
      const response = await fetch("/api/import/subscriptions", {
        method: "POST",
        body,
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        created?: number;
        skipped?: number;
        errors?: string[];
      };
      if (!response.ok) {
        throw new Error(data.message ?? "インポートに失敗しました。");
      }
      setMessage(
        `${data.created ?? 0}件を登録しました。スキップ ${data.skipped ?? 0}件です。`,
      );
      if (data.errors?.length) setError(data.errors.join("\n"));
      setPreview(null);
      setSourceFile(null);
      form?.reset();
      router.refresh();
    } catch (err) {
      setError(userErrorMessage(err, "インポートに失敗しました。"));
    } finally {
      setStage(null);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="CSVファイル">
        <input
          name="file"
          type="file"
          accept=".csv,text/csv"
          className="input"
          disabled={disabled}
          onChange={(event) => {
            setSourceFile(event.target.files?.[0] ?? null);
            setPreview(null);
            setMessage("");
            setError("");
          }}
          required
        />
      </Field>
      <div className="flex flex-wrap items-start gap-3">
        <p className="text-sm leading-6 text-slate-600">
          対応列:
          サービス名、料金、請求周期、次回更新日、カテゴリ、支払い方法、サービスURL、解約URL、メモ、カスタム周期日数、仕事利用割合、請求元、外貨の換算根拠です。CSVは1MB・200行まで取り込めます。
        </p>
        <CsvHelpPopover
          title="CSVインポートの見方"
          note="CSVの1行目をヘッダにする場合は、下の列名をこの順で入れてください。ヘッダがないCSVでも取り込めます。次回更新日は必須です。"
          rows={[
            {
              label: "サービス名",
              description: "登録するサービスの名前です。",
            },
            { label: "料金", description: "1回分の請求金額です。" },
            {
              label: "請求周期",
              description:
                "MONTHLY / QUARTERLY / SEMIANNUAL / YEARLY / WEEKLY / CUSTOM を入れます。QUARTERLYは3か月、SEMIANNUALは6か月の暦月周期です。CUSTOMの場合はカスタム周期日数も入力します。",
            },
            { label: "次回更新日", description: "YYYY-MM-DD 形式の日付です。" },
            {
              label: "カテゴリ",
              description:
                "カテゴリ名を入れます。未登録なら新しいカテゴリとして追加されます。",
            },
            {
              label: "支払い方法",
              description:
                "Stripe対応の登録済み支払い方法名を入れます。未設定なら空欄でも大丈夫です。",
            },
            {
              label: "サービスURL",
              description: "サービスの公式ページや管理ページです。",
            },
            {
              label: "解約URL",
              description: "解約ページや退会ページのURLです。",
            },
            { label: "メモ", description: "補足情報を自由に書けます。" },
            {
              label: "カスタム周期日数",
              description:
                "CUSTOMの場合だけ、請求間隔の日数を1から366で入力します。",
            },
            {
              label: "仕事利用割合",
              description:
                "0から100の整数です。0は個人利用、100は仕事利用、兼用は仕事で使う割合を入力します。",
            },
            {
              label: "請求元",
              description:
                "DIRECT / APPLE_APP_STORE / GOOGLE_PLAY / AMAZON / PAYPAL / MOBILE_CARRIER / OTHER を入力します。空欄は直接契約として扱います。",
            },
            {
              label: "請求通貨",
              description: "JPY / USD / EUR / GBP / AUD / CAD / KRW を入力します。空欄はJPYです。",
            },
            {
              label: "原通貨額",
              description: "外貨の場合に、請求書の金額を通貨の小数桁に合わせて入力します。JPYでは空欄にします。",
            },
            {
              label: "円換算レート",
              description: "外貨の場合に、1通貨あたりの円換算レートを小数4桁までで入力します。",
            },
            {
              label: "換算レート確認日",
              description: "YYYY-MM-DD形式です。外貨で空欄の場合は取込日を記録します。",
            },
          ]}
        />
      </div>
      {preview && (
        <div className="border-y border-blue-200 bg-white/70 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-black text-slate-950">登録前の内容確認</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {preview.hasHeader
                  ? "1行目をヘッダとして解析しました。"
                  : "ヘッダがないため、既定の列順として解析しました。"}
                変更した行は再検証後に選択できます。
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm font-bold">
              <span className="bg-emerald-50 px-3 py-2 text-emerald-800">登録可能 {currentValidCount}件</span>
              <span className="bg-amber-50 px-3 py-2 text-amber-800">要修正 {currentInvalidCount}件</span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => selectAllValid(true)} className="btn-secondary min-h-0 px-3 py-2 text-sm">
              有効行をすべて選択
            </button>
            <button type="button" onClick={() => selectAllValid(false)} className="btn-secondary min-h-0 px-3 py-2 text-sm">
              選択解除
            </button>
            <button type="button" onClick={revalidatePreview} disabled={stage !== null} className="btn-secondary min-h-0 px-3 py-2 text-sm">
              {stage === "revalidate" ? "再検証中..." : "変更を再検証"}
            </button>
          </div>
          <div className="mt-4 divide-y divide-slate-200 border-t border-slate-200">
            {preview.rows.map((row) => (
              <section key={row.rowNumber} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex min-h-11 items-center gap-3 font-black text-slate-900">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      disabled={!row.valid || stage !== null}
                      onChange={(event) => togglePreviewRow(row.rowNumber, event.target.checked)}
                      className="h-5 w-5"
                    />
                    {row.rowNumber}行目
                  </label>
                  <span className={row.valid
                    ? "bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800"
                    : "bg-amber-50 px-3 py-1 text-xs font-black text-amber-800"}
                  >
                    {row.valid ? "登録可能" : "要修正"}
                  </span>
                </div>
                {row.issues.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 bg-amber-50 px-8 py-3 text-sm font-semibold text-amber-900">
                    {row.issues.map((issue) => <li key={issue}>{issue}</li>)}
                  </ul>
                )}
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {CSV_PRIMARY_REVIEW_HEADERS.map((header) => (
                    <CsvReviewField
                      key={header}
                      header={header}
                      value={row.values[header]}
                      onChange={(value) => updatePreviewValue(row.rowNumber, header, value)}
                    />
                  ))}
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer py-2 text-sm font-black text-blue-700">URL・メモ・仕事利用など全項目を修正</summary>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {CSV_DETAIL_REVIEW_HEADERS.map((header) => (
                      <CsvReviewField
                        key={header}
                        header={header}
                        value={row.values[header]}
                        onChange={(value) => updatePreviewValue(row.rowNumber, header, value)}
                      />
                    ))}
                  </div>
                </details>
              </section>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              disabled={selectedCount === 0 || stage !== null}
              onClick={(event) => importSelected(event.currentTarget.form)}
              className="btn-primary"
            >
              {stage === "import" ? "登録中..." : `選択した${selectedCount}件を登録`}
            </button>
            <p className="text-sm font-semibold text-slate-600">要修正の行と未選択の行はDBへ保存しません。</p>
          </div>
        </div>
      )}
      {message && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      <button disabled={disabled || stage !== null || !sourceFile} className="btn-primary">
        {stage === "preview" ? "解析中..." : "内容を解析"}
      </button>
      {disabled && (
        <p className="text-sm font-semibold text-amber-700">
          CSVインポートはPremium限定です。
        </p>
      )}
    </form>
  );
}

export function CancellationChecklist({
  items,
}: {
  items: Array<{
    id: string;
    label: string;
    completedAt: Date | string | null;
  }>;
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
                await request(
                  `/api/cancellation-checklist/${item.id}`,
                  "PATCH",
                  { completed: !completed },
                );
                router.refresh();
              } finally {
                setLoadingId("");
              }
            }}
            className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm font-semibold transition ${
              completed
                ? "border-emerald-100 bg-emerald-50 text-emerald-800"
                : "border-slate-100 bg-white/80 text-slate-700 hover:border-blue-200 hover:bg-blue-50"
            }`}
          >
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-black ${completed ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"}`}
            >
              {completed ? "✓" : ""}
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function CancellationEvidenceForm({
  subscriptionId,
}: {
  subscriptionId: string;
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
    const formElement = event.currentTarget;

    const form = new FormData(formElement);
    try {
      await request(
        "/api/cancellation-evidences",
        "POST",
        Object.fromEntries(form.entries()),
      );
      formElement.reset();
      setMessage("証跡を追加しました。");
      router.refresh();
    } catch (err) {
      setError(userErrorMessage(err, "証跡の追加に失敗しました。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <Field label="証跡タイトル">
        <input
          name="title"
          className="input"
          maxLength={MAX_SUBSCRIPTION_NAME_LENGTH}
          required
          placeholder="例: 解約受付メール"
        />
      </Field>
      <Field label="種類">
        <select name="kind" className="input" defaultValue="MEMO">
          <option value="REQUEST">申請記録</option>
          <option value="RECEIPT">受付番号</option>
          <option value="EMAIL">メール</option>
          <option value="SCREENSHOT">スクリーンショットURL</option>
          <option value="MEMO">メモ</option>
        </select>
      </Field>
      <Field label="記録日">
        <input
          name="recordedAt"
          type="date"
          className="input"
          defaultValue={isoDate(new Date())}
        />
      </Field>
      <Field label="参照URL">
        <input
          name="referenceUrl"
          type="url"
          className="input"
          maxLength={MAX_URL_LENGTH}
          placeholder="メール、スクリーンショット、受付ページなど"
        />
      </Field>
      <label className="grid gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
        メモ
        <textarea
          name="memo"
          className="input min-h-24"
          maxLength={MAX_MEMO_LENGTH}
          placeholder="受付番号、担当窓口、確認した内容など"
        />
      </label>
      {message && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 md:col-span-2">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700 md:col-span-2">
          {error}
        </p>
      )}
      <div className="md:col-span-2">
        <button disabled={loading} className="btn-primary">
          {loading ? "追加中..." : "証跡を追加"}
        </button>
      </div>
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

type CsvSubscriptionCandidate = {
  name: string;
  merchant: string;
  amount: number;
  occurrences: number;
  firstDate: string;
  lastDate: string;
  confidence: number;
  reason: string;
  billingCycle: "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "YEARLY" | "WEEKLY";
  nextBillingDate: string;
  existingSubscriptionId: string | null;
};

type CsvStatementPaymentMatch = {
  rowNumber: number;
  merchant: string;
  amount: number | null;
  paidAt: string | null;
  suggestedSubscriptionId: string | null;
  confidence: number;
  reason: string;
  duplicate: boolean;
  issues: string[];
};

type CsvStatementSubscriptionOption = {
  id: string;
  name: string;
  status: string;
};

type CsvStatementPaymentRow = CsvStatementPaymentMatch & {
  subscriptionId: string;
  selected: boolean;
  imported: boolean;
  rememberMerchantAlias: boolean;
  aliasSaved: boolean;
  importBatchId: string | null;
};

export type StatementPaymentImportItem = {
  id: string;
  importedCount: number;
  savedAliasCount: number;
  remainingCount: number;
  undoneAt: string | null;
  undoneCount: number | null;
  createdAt: string;
};

function CsvCandidateRegistrationCard({ item }: { item: CsvSubscriptionCandidate }) {
  const router = useRouter();
  const [name, setName] = useState(item.name);
  const [billingCycle, setBillingCycle] = useState(item.billingCycle);
  const [nextBillingDate, setNextBillingDate] = useState(item.nextBillingDate);
  const [businessUsePercent, setBusinessUsePercent] = useState(MIN_BUSINESS_USE_PERCENT);
  const [registeredId, setRegisteredId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const detailId = item.existingSubscriptionId ?? registeredId;

  async function registerCandidate() {
    setError("");
    setLoading(true);
    try {
      const data = await request("/api/subscriptions", "POST", {
        name,
        price: item.amount,
        billingCycle,
        nextBillingDate,
        status: "ACTIVE",
        businessUsePercent,
        usageFrequency: "UNKNOWN",
        priority: "UNKNOWN",
      });
      if (!data.id) {
        throw new Error("登録結果を確認できませんでした。サブスク一覧を確認してください。");
      }
      setRegisteredId(data.id);
      router.refresh();
    } catch (err) {
      setError(userErrorMessage(err, "候補の登録に失敗しました。"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-white bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-black">{item.merchant}</p>
          <p className="mt-1 text-sm text-slate-500">
            {item.occurrences}回 / {item.firstDate || "日付不明"} - {item.lastDate || "日付不明"}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="font-black">{new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(item.amount)}</p>
          <p className="text-xs font-bold text-blue-700">信頼度 {item.confidence}%</p>
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-600">{item.reason}</p>
      {detailId ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-emerald-50 p-3">
          <p className="text-sm font-bold text-emerald-800">{item.existingSubscriptionId ? "この候補は登録済みです。" : "サブスクへ登録しました。"}</p>
          <Link href={`/subscriptions/${detailId}`} className="text-sm font-black text-emerald-800 underline">詳細を確認</Link>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="登録名">
            <input value={name} onChange={(event) => setName(event.target.value)} className="input" maxLength={MAX_SUBSCRIPTION_NAME_LENGTH} required />
          </Field>
          <Field label="請求周期">
            <select value={billingCycle} onChange={(event) => setBillingCycle(event.target.value as CsvSubscriptionCandidate["billingCycle"])} className="input">
              <option value="MONTHLY">月額</option>
              <option value="QUARTERLY">3か月ごと</option>
              <option value="SEMIANNUAL">6か月ごと</option>
              <option value="YEARLY">年額</option>
              <option value="WEEKLY">週額</option>
            </select>
          </Field>
          <Field label="次回更新日">
            <input type="date" value={nextBillingDate} onChange={(event) => setNextBillingDate(event.target.value)} className="input" required />
          </Field>
          <Field label="仕事利用割合">
            <input type="number" value={businessUsePercent} onChange={(event) => setBusinessUsePercent(Number(event.target.value))} className="input" min={MIN_BUSINESS_USE_PERCENT} max={MAX_BUSINESS_USE_PERCENT} required />
          </Field>
          <div className="flex flex-col items-start justify-end gap-2 sm:col-span-2 lg:col-span-4">
            {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
            <button type="button" onClick={registerCandidate} disabled={loading || !name.trim() || !nextBillingDate} className="btn-primary">
              {loading ? "登録中..." : "確認した内容で登録"}
            </button>
            {!nextBillingDate && <p className="text-xs font-semibold text-amber-700">日付を推定できませんでした。明細や契約画面で次回更新日を確認して入力してください。</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function CsvCandidateDetectorForm({
  disabled,
  initialPaymentImports,
}: {
  disabled: boolean;
  initialPaymentImports: StatementPaymentImportItem[];
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [paymentRows, setPaymentRows] = useState<CsvStatementPaymentRow[]>([]);
  const [paymentImports, setPaymentImports] = useState(initialPaymentImports);
  const [undoingImportId, setUndoingImportId] = useState<string | null>(null);
  const [importHistoryError, setImportHistoryError] = useState("");
  const [result, setResult] = useState<{
    totalRows: number;
    detected: number;
    candidates: CsvSubscriptionCandidate[];
    subscriptionOptions: CsvStatementSubscriptionOption[];
  } | null>(null);
  const selectedPaymentCount = paymentRows.filter((row) => row.selected && !row.imported).length;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPaymentError("");
    setPaymentMessage("");
    setLoading(true);
    setResult(null);
    setPaymentRows([]);
    const formElement = event.currentTarget;

    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/import/candidates", {
        method: "POST",
        body: form,
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        totalRows?: number;
        detected?: number;
        candidates?: CsvSubscriptionCandidate[];
        paymentMatches?: CsvStatementPaymentMatch[];
        subscriptionOptions?: CsvStatementSubscriptionOption[];
      };
      if (!response.ok)
        throw new Error(data.message ?? "候補検出に失敗しました。");
      if (!data.candidates || !data.paymentMatches || !data.subscriptionOptions) {
        throw new Error("解析結果を確認できませんでした。もう一度お試しください。");
      }
      setResult({
        totalRows: data.totalRows ?? 0,
        detected: data.detected ?? data.candidates.length,
        candidates: data.candidates,
        subscriptionOptions: data.subscriptionOptions,
      });
      setPaymentRows(data.paymentMatches.map((row) => ({
        ...row,
        subscriptionId: row.suggestedSubscriptionId ?? "",
        selected: false,
        imported: false,
        rememberMerchantAlias: false,
        aliasSaved: false,
        importBatchId: null,
      })));
    } catch (err) {
      setError(userErrorMessage(err, "候補検出に失敗しました。"));
    } finally {
      setLoading(false);
    }
  }

  function updatePaymentRow(
    rowNumber: number,
    changes: Partial<Pick<CsvStatementPaymentRow, "subscriptionId" | "amount" | "paidAt">>,
  ) {
    const clearsAmountIssue = Object.prototype.hasOwnProperty.call(changes, "amount");
    const clearsDateIssue = Object.prototype.hasOwnProperty.call(changes, "paidAt");
    setPaymentRows((current) => current.map((row) => row.rowNumber === rowNumber
      ? {
          ...row,
          ...changes,
          selected: false,
          rememberMerchantAlias: Object.prototype.hasOwnProperty.call(changes, "subscriptionId")
            ? false
            : row.rememberMerchantAlias,
          duplicate: false,
          issues: row.issues.filter((issue) =>
            !issue.includes("既にあります")
            && !(clearsAmountIssue && issue.includes("金額"))
            && !(clearsDateIssue && issue.includes("利用日")),
          ),
        }
      : row));
  }

  function paymentRowSelectable(row: CsvStatementPaymentRow) {
    return !row.imported
      && !row.duplicate
      && row.issues.length === 0
      && Boolean(row.subscriptionId)
      && row.amount !== null
      && Number.isInteger(row.amount)
      && row.amount > 0
      && Boolean(row.paidAt);
  }

  async function importPayments() {
    const selected = paymentRows.filter((row) => row.selected && paymentRowSelectable(row));
    if (selected.length === 0) {
      setPaymentError("登録する支払い行を1件以上選択してください。");
      return;
    }
    setPaymentLoading(true);
    setPaymentError("");
    setPaymentMessage("");
    try {
      const response = await fetch("/api/import/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: selected.map((row) => ({
          rowNumber: row.rowNumber,
          subscriptionId: row.subscriptionId,
          amount: row.amount,
          paidAt: row.paidAt,
          merchant: row.merchant,
          rememberMerchantAlias: row.rememberMerchantAlias,
        })) }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        createdCount?: number;
        savedAliasCount?: number;
        paymentImport?: StatementPaymentImportItem;
      };
      if (!response.ok) {
        throw new Error(data.message ?? "支払い履歴の一括登録に失敗しました。");
      }
      if (!data.paymentImport) {
        throw new Error("取込履歴を確認できませんでした。画面を再読み込みしてください。");
      }
      const paymentImport = data.paymentImport;
      const importedRows = new Set(selected.map((row) => row.rowNumber));
      setPaymentRows((current) => current.map((row) => importedRows.has(row.rowNumber)
        ? {
            ...row,
            imported: true,
            selected: false,
            aliasSaved: row.rememberMerchantAlias,
            importBatchId: paymentImport.id,
          }
        : row));
      setPaymentMessage(
        `${data.createdCount ?? selected.length}件を支払い履歴へ登録しました。`
        + ((data.savedAliasCount ?? 0) > 0
          ? ` 明細名義ルールを${data.savedAliasCount}件保存しました。`
          : ""),
      );
      setPaymentImports((current) => [paymentImport, ...current]
        .slice(0, STATEMENT_PAYMENT_IMPORT_HISTORY_LIMIT));
    } catch (err) {
      setPaymentError(userErrorMessage(err, "支払い履歴の一括登録に失敗しました。"));
    } finally {
      setPaymentLoading(false);
    }
  }

  async function undoPaymentImport(item: StatementPaymentImportItem) {
    if (!window.confirm(
      `この取込に残っている支払い履歴${item.remainingCount}件を削除します。手入力や別の取込は削除されません。よろしいですか？`,
    )) return;
    setUndoingImportId(item.id);
    setImportHistoryError("");
    try {
      const response = await fetch(`/api/import/payments/${item.id}`, { method: "DELETE" });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        undoneAt?: string;
        undoneCount?: number;
      };
      if (!response.ok || !data.undoneAt || data.undoneCount === undefined) {
        throw new Error(data.message ?? "取込の取り消しに失敗しました。");
      }
      setPaymentImports((current) => current.map((paymentImport) => paymentImport.id === item.id
        ? {
            ...paymentImport,
            remainingCount: 0,
            undoneAt: data.undoneAt as string,
            undoneCount: data.undoneCount as number,
          }
        : paymentImport));
      setPaymentRows((current) => current.map((row) => row.importBatchId === item.id
        ? { ...row, imported: false, importBatchId: null }
        : row));
      setPaymentMessage(`${data.undoneCount}件の支払い履歴を取り消しました。明細名義ルールは削除していません。`);
    } catch (err) {
      setImportHistoryError(userErrorMessage(err, "取込の取り消しに失敗しました。"));
    } finally {
      setUndoingImportId(null);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="カード・銀行明細CSV">
          <input
            name="file"
            type="file"
            accept=".csv,text/csv"
            className="input"
            disabled={disabled}
            required
          />
        </Field>
        <p className="text-sm leading-6 text-slate-600">
          摘要、利用店名、加盟店名、金額、利用日などの列を解析します。既存契約へ照合した支払い候補と、未登録サブスク候補を分けて確認できます。確認した名義だけを次回の照合ルールとして保存でき、明細CSVそのものは保存しません。
        </p>
        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}
        <button disabled={disabled || loading} className="btn-primary">
          {loading ? "解析中..." : "明細を解析"}
        </button>
        {disabled && (
          <p className="text-sm font-semibold text-amber-700">
            明細解析と支払い履歴の一括登録はPremium限定です。
          </p>
        )}
      </form>
      <section className="rounded-lg border border-slate-200 bg-white/90 p-4" aria-labelledby="statement-import-history-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase text-blue-700">IMPORT HISTORY</p>
            <h3 id="statement-import-history-title" className="mt-1 text-lg font-black text-slate-950">最近の支払い一括取込</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              誤って登録した場合は、その取込で作成され現在も残っている支払い履歴だけを取り消せます。CSV本体とファイル名は保存しません。
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-black text-slate-700">直近{STATEMENT_PAYMENT_IMPORT_HISTORY_LIMIT}件</span>
        </div>
        <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
          {paymentImports.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-black text-slate-950">
                  {new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  {statementPaymentImportStatusLabel(item)}
                  {item.savedAliasCount > 0 ? ` / 名義ルール${item.savedAliasCount}件保存` : ""}
                </p>
                {item.undoneAt && (
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    取り消し日時 {new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.undoneAt))}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="btn-danger shrink-0"
                disabled={Boolean(item.undoneAt) || undoingImportId !== null}
                onClick={() => undoPaymentImport(item)}
              >
                {item.undoneAt
                  ? "取り消し済み"
                  : undoingImportId === item.id
                    ? "取込を取り消し中..."
                    : `この取込を取り消す（${item.remainingCount}件）`}
              </button>
            </div>
          ))}
          {paymentImports.length === 0 && (
            <p className="py-4 text-sm font-semibold text-slate-500">支払い履歴へ確定した明細取込はまだありません。</p>
          )}
        </div>
        <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
          名義ルールは次回照合に使う独立データのため自動削除しません。不要な場合は各契約の詳細画面から削除できます。
        </p>
        {importHistoryError && <p className="mt-3 whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{importHistoryError}</p>}
      </section>
      {result && (
        <div className="space-y-5">
          <section className="rounded-lg border border-slate-200 bg-white/90 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase text-blue-700">月次整理</p>
                <h3 className="mt-1 text-lg font-black text-slate-950">既存契約の支払い候補</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {result.totalRows}行を解析しました。契約・金額・支払日を確認し、登録する行だけを選択してください。名義の記憶は初期OFFです。
                </p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-black text-blue-800">
                選択 {selectedPaymentCount}件
              </span>
            </div>
            <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
              {paymentRows.map((row) => {
                const selectable = paymentRowSelectable(row);
                return (
                  <div key={row.rowNumber} className="grid gap-3 py-4 lg:grid-cols-[auto_minmax(160px,1.2fr)_minmax(180px,1fr)_140px_160px] lg:items-end">
                    <label className="flex min-h-11 items-center gap-2 text-sm font-black text-slate-700">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        disabled={!selectable || paymentLoading}
                        onChange={(event) => setPaymentRows((current) => current.map((item) => item.rowNumber === row.rowNumber
                          ? { ...item, selected: event.target.checked }
                          : item))}
                      />
                      {row.rowNumber}行目
                    </label>
                    <div className="min-w-0">
                      <p className="truncate font-black text-slate-950">{row.merchant || "摘要不明"}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {row.suggestedSubscriptionId ? `照合信頼度 ${row.confidence}% / ${row.reason}` : row.reason}
                      </p>
                      {row.imported && <p className="mt-1 text-xs font-black text-emerald-700">登録済み</p>}
                      {row.aliasSaved && <p className="mt-1 text-xs font-black text-emerald-700">次回用の明細名義を保存済み</p>}
                      {row.issues.map((issue) => <p key={issue} className="mt-1 text-xs font-bold text-red-700">{issue}</p>)}
                      <label className="mt-2 flex items-start gap-2 text-xs font-bold text-slate-600">
                        <input
                          type="checkbox"
                          checked={row.rememberMerchantAlias}
                          disabled={row.imported || paymentLoading || !row.subscriptionId || !row.merchant}
                          onChange={(event) => setPaymentRows((current) => current.map((item) => item.rowNumber === row.rowNumber
                            ? { ...item, rememberMerchantAlias: event.target.checked, selected: false }
                            : item))}
                          className="mt-0.5"
                        />
                        この明細名義を次回も同じ契約へ提案する
                      </label>
                    </div>
                    <label className="grid gap-1 text-xs font-bold text-slate-600">
                      契約
                      <select
                        value={row.subscriptionId}
                        disabled={row.imported || paymentLoading}
                        onChange={(event) => updatePaymentRow(row.rowNumber, { subscriptionId: event.target.value })}
                        className="input min-w-0"
                      >
                        <option value="">契約を選択</option>
                        {result.subscriptionOptions.map((option) => (
                          <option key={option.id} value={option.id}>{option.name}{option.status === "ACTIVE" ? "" : "（契約終了）"}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-slate-600">
                      支払金額
                      <input
                        type="number"
                        min={1}
                        value={row.amount ?? ""}
                        disabled={row.imported || paymentLoading}
                        onChange={(event) => updatePaymentRow(row.rowNumber, {
                          amount: event.target.value ? Number(event.target.value) : null,
                        })}
                        className="input min-w-0"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-slate-600">
                      支払日
                      <input
                        type="date"
                        value={row.paidAt ?? ""}
                        disabled={row.imported || paymentLoading}
                        onChange={(event) => updatePaymentRow(row.rowNumber, { paidAt: event.target.value || null })}
                        className="input min-w-0"
                      />
                    </label>
                  </div>
                );
              })}
            </div>
            {paymentRows.length === 0 && <p className="mt-4 text-sm font-semibold text-slate-500">支払いとして確認できる行はありません。</p>}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={importPayments}
                disabled={paymentLoading || selectedPaymentCount === 0}
                className="btn-primary"
              >
                {paymentLoading ? "登録中..." : `選択した${selectedPaymentCount}件を支払い履歴へ登録`}
              </button>
              <p className="text-xs font-semibold text-slate-500">重複候補と未選択行は登録されません。名義ルールも選択行だけ保存します。</p>
            </div>
            {paymentMessage && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{paymentMessage}</p>}
            {paymentError && <p className="mt-3 whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{paymentError}</p>}
          </section>

          <section className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
            <h3 className="text-lg font-black text-slate-950">未登録サブスク候補</h3>
            <p className="mt-1 text-sm font-semibold text-slate-600">解析結果: {result.detected}件。既に登録済みの候補は詳細画面へ移動できます。</p>
            <div className="mt-4 space-y-3">
              {result.candidates.length === 0 ? (
                <p className="text-sm font-semibold text-slate-500">候補は見つかりませんでした。</p>
              ) : result.candidates.map((item) => (
                <CsvCandidateRegistrationCard
                  key={`${item.merchant}-${item.amount}`}
                  item={item}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
