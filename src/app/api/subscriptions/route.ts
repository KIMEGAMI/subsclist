import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import {
  ALLOWED_URL_PROTOCOLS,
  DEFAULT_NOTIFY_DAYS_BEFORE,
  MAX_BUSINESS_USE_PERCENT,
  MAX_CUSTOM_CYCLE_DAYS,
  MAX_MEMO_LENGTH,
  MAX_NOTIFY_DAYS_BEFORE,
  MAX_SUBSCRIPTION_NAME_LENGTH,
  MAX_SUBSCRIPTION_PRICE,
  MAX_URL_LENGTH,
  MIN_BUSINESS_USE_PERCENT,
  MIN_CUSTOM_CYCLE_DAYS,
  PLACEHOLDER_HOSTS,
} from "@/lib/app-constants";
import { parseIsoCalendarDate } from "@/lib/calendar-date";
import { prisma } from "@/lib/prisma";
import { FREE_SUBSCRIPTION_LIMIT } from "@/lib/plans";
import { readJsonBody } from "@/lib/request-body";
import { ownsSubscriptionRelations } from "@/lib/subscription-relations";
import {
  subscriptionFieldErrorDetails,
  subscriptionValidationDetails,
} from "@/lib/subscription-form-errors";
import { notificationEnabledSchema } from "@/lib/subscription-notification";
import {
  defaultAccountingLabelSchema,
  normalizeDefaultAccountingLabel,
} from "@/lib/subscription-default-accounting";
import { BILLING_PROVIDER_VALUES } from "@/lib/subscription-billing-provider";
import {
  MAX_EXCHANGE_RATE_INPUT_LENGTH,
  MAX_SOURCE_AMOUNT_INPUT_LENGTH,
  SUBSCRIPTION_CURRENCIES,
  subscriptionCurrencyContext,
} from "@/lib/subscription-currency";

const calendarDateSchema = z
  .string()
  .refine((value) => parseIsoCalendarDate(value) !== null);
const optionalCalendarDateSchema = z
  .union([z.literal(""), calendarDateSchema])
  .optional();

const schema = z.object({
  name: z.string().trim().min(1).max(MAX_SUBSCRIPTION_NAME_LENGTH),
  price: z.coerce.number().int().min(0).max(MAX_SUBSCRIPTION_PRICE),
  currency: z.enum(SUBSCRIPTION_CURRENCIES).default("JPY"),
  sourceAmount: z.string().max(MAX_SOURCE_AMOUNT_INPUT_LENGTH).optional(),
  exchangeRateToJpy: z.string().max(MAX_EXCHANGE_RATE_INPUT_LENGTH).optional(),
  exchangeRateUpdatedAt: optionalCalendarDateSchema,
  billingCycle: z.enum(["MONTHLY", "YEARLY", "WEEKLY", "CUSTOM"]),
  customCycleDays: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce
      .number()
      .int()
      .min(MIN_CUSTOM_CYCLE_DAYS)
      .max(MAX_CUSTOM_CYCLE_DAYS)
      .optional(),
  ),
  nextBillingDate: calendarDateSchema,
  categoryId: z.string().optional(),
  paymentMethodId: z.string().optional(),
  billingProvider: z.enum(BILLING_PROVIDER_VALUES).default("DIRECT"),
  status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]),
  notifyDaysBefore: z.coerce
    .number()
    .int()
    .min(0)
    .max(MAX_NOTIFY_DAYS_BEFORE)
    .optional(),
  notificationsEnabled: notificationEnabledSchema,
  businessUsePercent: z.coerce
    .number()
    .int()
    .min(MIN_BUSINESS_USE_PERCENT)
    .max(MAX_BUSINESS_USE_PERCENT)
    .default(MIN_BUSINESS_USE_PERCENT),
  defaultAccountingLabel: defaultAccountingLabelSchema,
  serviceUrl: z.string().max(MAX_URL_LENGTH).optional(),
  cancellationUrl: z.string().max(MAX_URL_LENGTH).optional(),
  trialEndsAt: optionalCalendarDateSchema,
  cancellationDeadline: optionalCalendarDateSchema,
  lastReviewedAt: optionalCalendarDateSchema,
  usageFrequency: z
    .enum(["DAILY", "WEEKLY", "MONTHLY", "RARELY", "UNKNOWN"])
    .optional(),
  priority: z.enum(["ESSENTIAL", "USEFUL", "OPTIONAL", "UNKNOWN"]).optional(),
  logoUrl: z.string().max(MAX_URL_LENGTH).optional(),
  memo: z.string().max(MAX_MEMO_LENGTH).optional(),
});

function optionalDate(value?: string) {
  return value ? parseIsoCalendarDate(value) : null;
}

function optionalUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      (PLACEHOLDER_HOSTS as readonly string[]).includes(
        url.hostname.toLowerCase(),
      )
    )
      return null;
    return (ALLOWED_URL_PROTOCOLS as readonly string[]).includes(url.protocol)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  const parsed = schema.safeParse(await readJsonBody(request));
  if (!parsed.success)
    return NextResponse.json(
      subscriptionValidationDetails(parsed.error.issues),
      { status: 400 },
    );

  const [subscriptionCount, preference] = await Promise.all([
    prisma.subscription.count({
      where: { userId: user.id, deletedAt: null },
    }),
    prisma.userPreference.findUnique({
      where: { userId: user.id },
      select: { defaultNotifyDaysBefore: true },
    }),
  ]);
  if (user.plan === "FREE" && subscriptionCount >= FREE_SUBSCRIPTION_LIMIT) {
    return NextResponse.json(
      {
        message:
          "Freeプランではサブスク登録は10件までです。Premiumに変更すると無制限に登録できます。",
      },
      { status: 403 },
    );
  }

  const data = parsed.data;
  if (data.billingCycle === "CUSTOM" && !data.customCycleDays) {
    return NextResponse.json(
      subscriptionFieldErrorDetails(
        "customCycleDays",
        "カスタム請求では周期日数を入力してください。",
      ),
      { status: 400 },
    );
  }
  const currencyContext = subscriptionCurrencyContext(data);
  if (!currencyContext.ok) {
    return NextResponse.json(
      subscriptionFieldErrorDetails(
        currencyContext.field,
        currencyContext.message,
      ),
      { status: 400 },
    );
  }
  if (!(await ownsSubscriptionRelations(user.id, data))) {
    return NextResponse.json(
      { message: "選択したカテゴリまたは支払い方法を使用できません。" },
      { status: 400 },
    );
  }
  const notifyDaysBefore =
    data.notifyDaysBefore
    ?? preference?.defaultNotifyDaysBefore
    ?? DEFAULT_NOTIFY_DAYS_BEFORE;
  const subscription = await prisma.$transaction(async (transaction) => {
    const created = await transaction.subscription.create({
      data: {
        userId: user.id,
        name: data.name,
        price: data.price,
        currency: currencyContext.data.currency,
        sourceAmountMinor: currencyContext.data.sourceAmountMinor,
        exchangeRateToJpyScaled:
          currencyContext.data.exchangeRateToJpyScaled,
        exchangeRateUpdatedAt:
          currencyContext.data.exchangeRateToJpyScaled === null
            ? null
            : optionalDate(data.exchangeRateUpdatedAt) ?? new Date(),
        billingCycle: data.billingCycle,
        customCycleDays:
          data.billingCycle === "CUSTOM" ? data.customCycleDays : null,
        nextBillingDate: parseIsoCalendarDate(data.nextBillingDate) as Date,
        categoryId: data.categoryId || null,
        paymentMethodId: data.paymentMethodId || null,
        billingProvider: data.billingProvider,
        status: data.status,
        notifyDaysBefore,
        businessUsePercent: data.businessUsePercent,
        defaultAccountingLabel: normalizeDefaultAccountingLabel(
          data.defaultAccountingLabel,
        ),
        serviceUrl: optionalUrl(data.serviceUrl),
        cancellationUrl: optionalUrl(data.cancellationUrl),
        trialEndsAt: optionalDate(data.trialEndsAt),
        cancellationDeadline: optionalDate(data.cancellationDeadline),
        lastReviewedAt: optionalDate(data.lastReviewedAt),
        usageFrequency: data.usageFrequency ?? "UNKNOWN",
        priority: data.priority ?? "UNKNOWN",
        logoUrl: optionalUrl(data.logoUrl),
        memo: data.memo || null,
      },
    });
    await transaction.notificationSetting.create({
      data: {
        userId: user.id,
        subscriptionId: created.id,
        daysBefore: notifyDaysBefore,
        enabled: data.notificationsEnabled,
      },
    });
    return created;
  });

  return NextResponse.json({ id: subscription.id });
}
