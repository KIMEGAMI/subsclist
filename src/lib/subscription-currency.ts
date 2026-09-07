import { MAX_SUBSCRIPTION_PRICE } from "./app-constants.ts";

export const SUBSCRIPTION_CURRENCIES = [
  "JPY",
  "USD",
  "EUR",
  "GBP",
  "AUD",
  "CAD",
  "KRW",
] as const;

export type SubscriptionCurrency = (typeof SUBSCRIPTION_CURRENCIES)[number];

export function isSubscriptionCurrency(value: string): value is SubscriptionCurrency {
  return (SUBSCRIPTION_CURRENCIES as readonly string[]).includes(value);
}

export const SUBSCRIPTION_CURRENCY_LABELS: Record<SubscriptionCurrency, string> = {
  JPY: "日本円 (JPY)",
  USD: "米ドル (USD)",
  EUR: "ユーロ (EUR)",
  GBP: "英ポンド (GBP)",
  AUD: "豪ドル (AUD)",
  CAD: "カナダドル (CAD)",
  KRW: "韓国ウォン (KRW)",
};

const CURRENCY_DECIMAL_DIGITS: Record<SubscriptionCurrency, number> = {
  JPY: 0,
  USD: 2,
  EUR: 2,
  GBP: 2,
  AUD: 2,
  CAD: 2,
  KRW: 0,
};

export const EXCHANGE_RATE_SCALE = 10_000;
export const MAX_EXCHANGE_RATE_TO_JPY = 100_000;
export const MAX_SOURCE_AMOUNT_INPUT_LENGTH = 32;
export const MAX_EXCHANGE_RATE_INPUT_LENGTH = 16;
const MAX_EXCHANGE_RATE_DECIMAL_DIGITS = 4;

function decimalPattern(decimalDigits: number) {
  return decimalDigits === 0
    ? /^\d+$/
    : new RegExp(`^\\d+(?:\\.\\d{1,${decimalDigits}})?$`);
}

function decimalFactor(decimalDigits: number) {
  return 10 ** decimalDigits;
}

export function parseSourceAmountMinor(value: string, currency: SubscriptionCurrency) {
  const normalized = value.trim();
  const decimalDigits = CURRENCY_DECIMAL_DIGITS[currency];
  if (!decimalPattern(decimalDigits).test(normalized)) return null;
  const [wholePart, fractionPart = ""] = normalized.split(".");
  const factor = decimalFactor(decimalDigits);
  const fraction = fractionPart.padEnd(decimalDigits, "0");
  const amount = Number(wholePart) * factor + Number(fraction || "0");
  const maxAmount = MAX_SUBSCRIPTION_PRICE * factor;
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= maxAmount
    ? amount
    : null;
}

export function formatSourceAmountMinor(amountMinor: number, currency: SubscriptionCurrency) {
  const decimalDigits = CURRENCY_DECIMAL_DIGITS[currency];
  const factor = decimalFactor(decimalDigits);
  const whole = Math.floor(amountMinor / factor);
  if (decimalDigits === 0) return String(whole);
  const fraction = String(amountMinor % factor).padStart(decimalDigits, "0");
  return `${whole}.${fraction}`;
}

export function parseExchangeRateScaled(value: string) {
  const normalized = value.trim();
  if (!decimalPattern(MAX_EXCHANGE_RATE_DECIMAL_DIGITS).test(normalized)) return null;
  const [wholePart, fractionPart = ""] = normalized.split(".");
  const fraction = fractionPart.padEnd(MAX_EXCHANGE_RATE_DECIMAL_DIGITS, "0");
  const rate = Number(wholePart) * EXCHANGE_RATE_SCALE + Number(fraction || "0");
  const maxRate = MAX_EXCHANGE_RATE_TO_JPY * EXCHANGE_RATE_SCALE;
  return Number.isSafeInteger(rate) && rate > 0 && rate <= maxRate ? rate : null;
}

export function formatExchangeRateScaled(rateScaled: number) {
  const whole = Math.floor(rateScaled / EXCHANGE_RATE_SCALE);
  const fraction = String(rateScaled % EXCHANGE_RATE_SCALE)
    .padStart(MAX_EXCHANGE_RATE_DECIMAL_DIGITS, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function convertedPriceInJpy(
  amountMinor: number,
  currency: SubscriptionCurrency,
  rateScaled: number,
) {
  const amountFactor = decimalFactor(CURRENCY_DECIMAL_DIGITS[currency]);
  const denominator = BigInt(amountFactor) * BigInt(EXCHANGE_RATE_SCALE);
  const numerator = BigInt(amountMinor) * BigInt(rateScaled);
  return Number((numerator + denominator / BigInt(2)) / denominator);
}

export function isForeignSubscriptionCurrency(currency: SubscriptionCurrency) {
  return currency !== "JPY";
}

export type SubscriptionCurrencyContext = {
  currency: SubscriptionCurrency;
  sourceAmountMinor: number | null;
  exchangeRateToJpyScaled: number | null;
};

export type SubscriptionCurrencyContextResult =
  | { ok: true; data: SubscriptionCurrencyContext }
  | {
      ok: false;
      field: "sourceAmount" | "exchangeRateToJpy";
      message: string;
    };

export function subscriptionCurrencyContext(input: {
  currency: SubscriptionCurrency;
  sourceAmount?: string;
  exchangeRateToJpy?: string;
}): SubscriptionCurrencyContextResult {
  if (!isForeignSubscriptionCurrency(input.currency)) {
    return {
      ok: true,
      data: {
        currency: input.currency,
        sourceAmountMinor: null,
        exchangeRateToJpyScaled: null,
      },
    };
  }

  const sourceAmountMinor = parseSourceAmountMinor(
    input.sourceAmount ?? "",
    input.currency,
  );
  if (sourceAmountMinor === null || sourceAmountMinor <= 0) {
    return {
      ok: false,
      field: "sourceAmount",
      message: "原通貨の請求額を0より大きい数値で入力してください。",
    };
  }
  const exchangeRateToJpyScaled = parseExchangeRateScaled(
    input.exchangeRateToJpy ?? "",
  );
  if (exchangeRateToJpyScaled === null) {
    return {
      ok: false,
      field: "exchangeRateToJpy",
      message: "1通貨あたりの円換算レートを正しく入力してください。",
    };
  }
  return {
    ok: true,
    data: {
      currency: input.currency,
      sourceAmountMinor,
      exchangeRateToJpyScaled,
    },
  };
}
