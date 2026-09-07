import { z } from "zod";
import {
  ALLOWED_URL_PROTOCOLS,
  MAX_BUSINESS_USE_PERCENT,
  MAX_ACCOUNTING_LABEL_LENGTH,
  MAX_CATEGORY_NAME_LENGTH,
  MAX_CUSTOM_CYCLE_DAYS,
  MAX_MEMO_LENGTH,
  MAX_PAYMENT_METHOD_NAME_LENGTH,
  MAX_SUBSCRIPTION_NAME_LENGTH,
  MAX_SUBSCRIPTION_PRICE,
  MAX_URL_LENGTH,
  MIN_BUSINESS_USE_PERCENT,
  MIN_CUSTOM_CYCLE_DAYS,
  PLACEHOLDER_HOSTS,
} from "./app-constants.ts";
import { parseCsvRows } from "./csv.ts";
import {
  BILLING_PROVIDER_VALUES,
  parseBillingProvider,
  type BillingProvider,
} from "./subscription-billing-provider.ts";
import {
  isSubscriptionCurrency,
  MAX_EXCHANGE_RATE_INPUT_LENGTH,
  MAX_SOURCE_AMOUNT_INPUT_LENGTH,
  subscriptionCurrencyContext,
  type SubscriptionCurrency,
} from "./subscription-currency.ts";
import {
  SUBSCRIPTION_IMPORT_HEADERS,
  type SubscriptionImportValues,
} from "./subscription-csv-columns.ts";

export {
  SUBSCRIPTION_IMPORT_HEADERS,
  type SubscriptionImportHeader,
  type SubscriptionImportValues,
} from "./subscription-csv-columns.ts";
export type SubscriptionImportBillingCycle =
  | "MONTHLY"
  | "YEARLY"
  | "WEEKLY"
  | "CUSTOM";

export type ValidatedSubscriptionImport = {
  name: string;
  price: number;
  billingCycle: SubscriptionImportBillingCycle;
  nextBillingDate: Date;
  customCycleDays: number | null;
  categoryName: string;
  paymentName: string;
  serviceUrl: string | null;
  cancellationUrl: string | null;
  memo: string;
  businessUsePercent: number;
  defaultAccountingLabel: string | null;
  billingProvider: BillingProvider;
  currency: SubscriptionCurrency;
  sourceAmountMinor: number | null;
  exchangeRateToJpyScaled: number | null;
  exchangeRateUpdatedAt: Date | null;
};

export type ParsedSubscriptionImportRow = {
  rowNumber: number;
  values: SubscriptionImportValues;
  issues: string[];
  data: ValidatedSubscriptionImport | null;
};

export type SubscriptionImportPreviewRow = {
  rowNumber: number;
  values: SubscriptionImportValues;
  valid: boolean;
  selected: boolean;
  issues: string[];
};

type SourceRow = Record<string, string>;

export function normalizeSubscriptionImportName(value: string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase("ja-JP");
}

const integerString = z.string().trim().regex(/^\d+$/);
const rowSchema = z.object({
  name: z.string().trim().min(1).max(MAX_SUBSCRIPTION_NAME_LENGTH),
  price: integerString.transform(Number).pipe(
    z.number().int().min(0).max(MAX_SUBSCRIPTION_PRICE),
  ),
  billingCycle: z.enum(["MONTHLY", "YEARLY", "WEEKLY", "CUSTOM"]),
  nextBillingDate: z.date(),
  customCycleDays: z.number().int().min(MIN_CUSTOM_CYCLE_DAYS).max(MAX_CUSTOM_CYCLE_DAYS).nullable(),
  categoryName: z.string().trim().max(MAX_CATEGORY_NAME_LENGTH),
  paymentName: z.string().trim().max(MAX_PAYMENT_METHOD_NAME_LENGTH),
  serviceUrl: z.string().max(MAX_URL_LENGTH),
  cancellationUrl: z.string().max(MAX_URL_LENGTH),
  memo: z.string().max(MAX_MEMO_LENGTH),
  businessUsePercent: integerString.transform(Number).pipe(
    z.number().int().min(MIN_BUSINESS_USE_PERCENT).max(MAX_BUSINESS_USE_PERCENT),
  ),
  defaultAccountingLabel: z.string().trim().max(MAX_ACCOUNTING_LABEL_LENGTH),
  billingProvider: z.enum(BILLING_PROVIDER_VALUES),
  currency: z.enum(["JPY", "USD", "EUR", "GBP", "AUD", "CAD", "KRW"]),
  sourceAmount: z.string().max(MAX_SOURCE_AMOUNT_INPUT_LENGTH),
  exchangeRateToJpy: z.string().max(MAX_EXCHANGE_RATE_INPUT_LENGTH),
  exchangeRateUpdatedAt: z.date().nullable(),
});

const fieldLabels: Record<keyof z.input<typeof rowSchema>, string> = {
  name: "サービス名",
  price: "料金",
  billingCycle: "請求周期",
  nextBillingDate: "次回更新日",
  customCycleDays: "カスタム周期日数",
  categoryName: "カテゴリ",
  paymentName: "支払い方法",
  serviceUrl: "サービスURL",
  cancellationUrl: "解約URL",
  memo: "メモ",
  businessUsePercent: "仕事利用割合",
  defaultAccountingLabel: "整理用初期科目",
  billingProvider: "請求元",
  currency: "請求通貨",
  sourceAmount: "原通貨額",
  exchangeRateToJpy: "円換算レート",
  exchangeRateUpdatedAt: "換算レート確認日",
};

function value(row: SourceRow, keys: readonly string[]) {
  for (const key of keys) {
    if (row[key]) return row[key];
  }
  return "";
}

function calendarDate(raw: string) {
  const normalized = raw.trim().replaceAll("/", "-");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== normalized
    ? null
    : parsed;
}

function billingCycle(raw: string): SubscriptionImportBillingCycle | null {
  const normalized = raw.trim().toUpperCase();
  if (!normalized || ["MONTHLY", "月額", "月間", "月"].includes(normalized)) return "MONTHLY";
  if (["YEARLY", "年額", "年間", "年"].includes(normalized)) return "YEARLY";
  if (["WEEKLY", "週額", "週間", "週"].includes(normalized)) return "WEEKLY";
  if (["CUSTOM", "カスタム"].includes(normalized)) return "CUSTOM";
  return null;
}

function safeOptionalUrl(raw: string) {
  const normalized = raw.trim();
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if ((PLACEHOLDER_HOSTS as readonly string[]).includes(url.hostname.toLowerCase())) return null;
    return (ALLOWED_URL_PROTOCOLS as readonly string[]).includes(url.protocol)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function isHeaderRow(row: string[]) {
  return row.some((cell) =>
    ["サービス名", "name", "service"].includes(cell.trim().toLowerCase()),
  );
}

function canonicalValues(row: SourceRow): SubscriptionImportValues {
  const cycleRaw = value(row, ["請求周期", "billingCycle", "cycle"]);
  const providerRaw = value(row, ["請求元", "billingProvider", "provider"]);
  const currencyRaw = value(row, ["請求通貨", "currency"]).trim().toUpperCase();
  return {
    サービス名: value(row, ["サービス名", "name", "Name", "service", "Service"]),
    料金: value(row, ["料金", "金額", "price", "amount", "Amount"]).replaceAll(",", ""),
    請求周期: billingCycle(cycleRaw) ?? cycleRaw,
    次回更新日: value(row, ["次回更新日", "nextBillingDate", "renewalDate"]).replaceAll("/", "-"),
    カテゴリ: value(row, ["カテゴリ", "category", "Category"]),
    支払い方法: value(row, ["支払い方法", "paymentMethod", "PaymentMethod"]),
    サービスURL: value(row, ["サービスURL", "serviceUrl", "url"]),
    解約URL: value(row, ["解約URL", "cancellationUrl"]),
    メモ: value(row, ["メモ", "memo", "note"]),
    カスタム周期日数: value(row, ["カスタム周期日数", "customCycleDays"]),
    仕事利用割合: value(row, ["仕事利用割合", "businessUsePercent"]) || String(MIN_BUSINESS_USE_PERCENT),
    整理用初期科目: value(row, ["整理用初期科目", "defaultAccountingLabel", "accountingLabel"]),
    請求元: parseBillingProvider(providerRaw) ?? providerRaw,
    請求通貨: isSubscriptionCurrency(currencyRaw || "JPY") ? currencyRaw || "JPY" : currencyRaw,
    原通貨額: value(row, ["原通貨額", "sourceAmount"]),
    円換算レート: value(row, ["円換算レート", "exchangeRateToJpy"]),
    換算レート確認日: value(row, ["換算レート確認日", "exchangeRateUpdatedAt"]).replaceAll("/", "-"),
  };
}

function validateValues(
  values: SubscriptionImportValues,
  rowNumber: number,
): ParsedSubscriptionImportRow {
  const cycle = billingCycle(values.請求周期);
  const provider = parseBillingProvider(values.請求元);
  const currency = isSubscriptionCurrency(values.請求通貨)
    ? values.請求通貨
    : null;
  const parsed = rowSchema.safeParse({
    name: values.サービス名,
    price: values.料金,
    billingCycle: cycle,
    nextBillingDate: calendarDate(values.次回更新日),
    customCycleDays: values.カスタム周期日数
      ? Number(values.カスタム周期日数)
      : null,
    categoryName: values.カテゴリ,
    paymentName: values.支払い方法,
    serviceUrl: values.サービスURL,
    cancellationUrl: values.解約URL,
    memo: values.メモ,
    businessUsePercent: values.仕事利用割合,
    defaultAccountingLabel: values.整理用初期科目,
    billingProvider: provider,
    currency,
    sourceAmount: values.原通貨額,
    exchangeRateToJpy: values.円換算レート,
    exchangeRateUpdatedAt: values.換算レート確認日
      ? calendarDate(values.換算レート確認日)
      : null,
  });
  const issues = parsed.success
    ? []
    : [...new Set(parsed.error.issues.map((issue) => {
        const field = issue.path[0];
        return typeof field === "string" && field in fieldLabels
          ? `${fieldLabels[field as keyof typeof fieldLabels]}を確認してください。`
          : "入力内容を確認してください。";
      }))];
  if (cycle === "CUSTOM" && parsed.success && parsed.data.customCycleDays === null) {
    issues.push("カスタム請求では周期日数を入力してください。");
  }
  if (values.サービスURL && !safeOptionalUrl(values.サービスURL)) {
    issues.push("サービスURLはhttpまたはhttpsの実在する形式で入力してください。");
  }
  if (values.解約URL && !safeOptionalUrl(values.解約URL)) {
    issues.push("解約URLはhttpまたはhttpsの実在する形式で入力してください。");
  }
  const currencyContext = parsed.success
    ? subscriptionCurrencyContext(parsed.data)
    : null;
  if (currencyContext && !currencyContext.ok) issues.push(currencyContext.message);
  if (!parsed.success || !currencyContext?.ok || issues.length > 0) {
    return { rowNumber, values, issues: [...new Set(issues)], data: null };
  }
  return {
    rowNumber,
    values,
    issues: [],
    data: {
      name: parsed.data.name,
      price: parsed.data.price,
      billingCycle: parsed.data.billingCycle,
      nextBillingDate: parsed.data.nextBillingDate,
      customCycleDays: parsed.data.customCycleDays,
      categoryName: parsed.data.categoryName,
      paymentName: parsed.data.paymentName,
      serviceUrl: safeOptionalUrl(parsed.data.serviceUrl),
      cancellationUrl: safeOptionalUrl(parsed.data.cancellationUrl),
      memo: parsed.data.memo,
      businessUsePercent: parsed.data.businessUsePercent,
      defaultAccountingLabel: parsed.data.defaultAccountingLabel || null,
      billingProvider: parsed.data.billingProvider,
      currency: currencyContext.data.currency,
      sourceAmountMinor: currencyContext.data.sourceAmountMinor,
      exchangeRateToJpyScaled: currencyContext.data.exchangeRateToJpyScaled,
      exchangeRateUpdatedAt:
        currencyContext.data.exchangeRateToJpyScaled === null
          ? null
          : parsed.data.exchangeRateUpdatedAt ?? new Date(),
    },
  };
}

export function parseSubscriptionCsvImport(text: string) {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  const [firstRow, ...remainingRows] = rows;
  if (!firstRow) return { hasHeader: false, rows: [] };
  const hasHeader = isHeaderRow(firstRow);
  const headers = hasHeader ? firstRow : [...SUBSCRIPTION_IMPORT_HEADERS];
  const body = hasHeader ? remainingRows : rows;
  return {
    hasHeader,
    rows: body.map((cells, index) => {
      const source = Object.fromEntries(
        headers.map((header, columnIndex) => [header, cells[columnIndex] ?? ""]),
      );
      return validateValues(
        canonicalValues(source),
        index + (hasHeader ? 2 : 1),
      );
    }),
  };
}

export function buildSubscriptionImportPreview(input: {
  rows: ParsedSubscriptionImportRow[];
  existingSubscriptionNames: readonly string[];
  availablePaymentMethodNames: readonly string[];
}): SubscriptionImportPreviewRow[] {
  const seenNames = new Set(
    input.existingSubscriptionNames.map(normalizeSubscriptionImportName),
  );
  const availablePaymentMethods = new Set(
    input.availablePaymentMethodNames.map(normalizeSubscriptionImportName),
  );
  return input.rows.map((row) => {
    const issues = [...row.issues];
    if (row.data) {
      const nameKey = normalizeSubscriptionImportName(row.data.name);
      if (seenNames.has(nameKey)) {
        issues.push("同名のサービスは既に登録済みか、CSV内で重複しています。");
      } else {
        seenNames.add(nameKey);
      }
      if (
        row.data.paymentName
        && !availablePaymentMethods.has(
          normalizeSubscriptionImportName(row.data.paymentName),
        )
      ) {
        issues.push("支払い方法はStripe対応の登録済み項目を指定してください。");
      }
    }
    const uniqueIssues = [...new Set(issues)];
    return {
      rowNumber: row.rowNumber,
      values: row.values,
      valid: uniqueIssues.length === 0,
      selected: uniqueIssues.length === 0,
      issues: uniqueIssues,
    };
  });
}
