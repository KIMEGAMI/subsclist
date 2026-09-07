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
import { isPremiumPlan } from "@/lib/plans";
import { readJsonBody } from "@/lib/request-body";
import { ownsSubscriptionRelations } from "@/lib/subscription-relations";
import {
  subscriptionFieldErrorDetails,
  subscriptionValidationDetails,
} from "@/lib/subscription-form-errors";
import { optionalNotificationEnabledSchema } from "@/lib/subscription-notification";
import {
  defaultAccountingLabelSchema,
  normalizeDefaultAccountingLabel,
} from "@/lib/subscription-default-accounting";
import { BILLING_PROVIDER_VALUES } from "@/lib/subscription-billing-provider";
import {
  formatExchangeRateScaled,
  formatSourceAmountMinor,
  isSubscriptionCurrency,
  MAX_EXCHANGE_RATE_INPUT_LENGTH,
  MAX_SOURCE_AMOUNT_INPUT_LENGTH,
  SUBSCRIPTION_CURRENCIES,
  subscriptionCurrencyContext,
} from "@/lib/subscription-currency";

const usageFrequencySchema = z.enum([
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "RARELY",
  "UNKNOWN",
]);
const calendarDateSchema = z
  .string()
  .refine((value) => parseIsoCalendarDate(value) !== null);
const optionalCalendarDateSchema = z
  .union([z.literal(""), calendarDateSchema])
  .optional();

const updateSchema = z.object({
  name: z.string().trim().min(1).max(MAX_SUBSCRIPTION_NAME_LENGTH).optional(),
  price: z.coerce.number().int().min(0).max(MAX_SUBSCRIPTION_PRICE).optional(),
  currency: z.enum(SUBSCRIPTION_CURRENCIES).optional(),
  sourceAmount: z.string().max(MAX_SOURCE_AMOUNT_INPUT_LENGTH).optional(),
  exchangeRateToJpy: z.string().max(MAX_EXCHANGE_RATE_INPUT_LENGTH).optional(),
  exchangeRateUpdatedAt: optionalCalendarDateSchema,
  billingCycle: z.enum(["MONTHLY", "YEARLY", "WEEKLY", "CUSTOM"]).optional(),
  customCycleDays: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce
      .number()
      .int()
      .min(MIN_CUSTOM_CYCLE_DAYS)
      .max(MAX_CUSTOM_CYCLE_DAYS)
      .optional(),
  ),
  nextBillingDate: calendarDateSchema.optional(),
  categoryId: z.string().optional(),
  paymentMethodId: z.string().optional(),
  billingProvider: z.enum(BILLING_PROVIDER_VALUES).optional(),
  status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]).optional(),
  notifyDaysBefore: z.coerce
    .number()
    .int()
    .min(0)
    .max(MAX_NOTIFY_DAYS_BEFORE)
    .optional(),
  notificationsEnabled: optionalNotificationEnabledSchema,
  businessUsePercent: z.coerce
    .number()
    .int()
    .min(MIN_BUSINESS_USE_PERCENT)
    .max(MAX_BUSINESS_USE_PERCENT)
    .optional(),
  defaultAccountingLabel: defaultAccountingLabelSchema,
  serviceUrl: z.string().max(MAX_URL_LENGTH).optional(),
  cancellationUrl: z.string().max(MAX_URL_LENGTH).optional(),
  trialEndsAt: optionalCalendarDateSchema,
  cancellationDeadline: optionalCalendarDateSchema,
  lastReviewedAt: optionalCalendarDateSchema,
  usageFrequency: usageFrequencySchema.optional(),
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

async function ensureOwner(id: string, userId: string) {
  return prisma.subscription.findFirst({
    where: { id, userId, deletedAt: null },
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  const { id } = await params;
  const [existing, existingNotificationSetting, preference] = await Promise.all([
    ensureOwner(id, user.id),
    prisma.notificationSetting.findFirst({
      where: { subscriptionId: id, userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { enabled: true, daysBefore: true },
    }),
    prisma.userPreference.findUnique({
      where: { userId: user.id },
      select: { defaultNotifyDaysBefore: true },
    }),
  ]);
  if (!existing)
    return NextResponse.json(
      { message: "対象が見つかりません。" },
      { status: 404 },
    );
  const parsed = updateSchema.safeParse(await readJsonBody(request));
  if (!parsed.success)
    return NextResponse.json(
      subscriptionValidationDetails(parsed.error.issues),
      { status: 400 },
    );
  const data = parsed.data;
  const {
    notificationsEnabled,
    currency,
    sourceAmount,
    exchangeRateToJpy,
    exchangeRateUpdatedAt,
    defaultAccountingLabel,
    ...subscriptionData
  } = data;
  const nextBillingCycle = data.billingCycle ?? existing.billingCycle;
  const nextCustomCycleDays = data.customCycleDays ?? existing.customCycleDays;
  if (nextBillingCycle === "CUSTOM" && !nextCustomCycleDays) {
    return NextResponse.json(
      subscriptionFieldErrorDetails(
        "customCycleDays",
        "カスタム請求では周期日数を入力してください。",
      ),
      { status: 400 },
    );
  }
  const currencyFieldsChanged =
    currency !== undefined
    || sourceAmount !== undefined
    || exchangeRateToJpy !== undefined
    || exchangeRateUpdatedAt !== undefined;
  const existingCurrency = isSubscriptionCurrency(existing.currency)
    ? existing.currency
    : "JPY";
  const nextCurrency = currency ?? existingCurrency;
  const currencyContext = currencyFieldsChanged
    ? subscriptionCurrencyContext({
        currency: nextCurrency,
        sourceAmount:
          sourceAmount
          ?? (nextCurrency === existingCurrency
            && existing.sourceAmountMinor !== null
            ? formatSourceAmountMinor(existing.sourceAmountMinor, nextCurrency)
            : undefined),
        exchangeRateToJpy:
          exchangeRateToJpy
          ?? (nextCurrency === existingCurrency
            && existing.exchangeRateToJpyScaled !== null
            ? formatExchangeRateScaled(existing.exchangeRateToJpyScaled)
            : undefined),
      })
    : null;
  if (currencyContext && !currencyContext.ok) {
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
  const priceChanged =
    (data.price !== undefined && data.price !== existing.price) ||
    (data.billingCycle !== undefined &&
      data.billingCycle !== existing.billingCycle) ||
    (nextBillingCycle === "CUSTOM" &&
      nextCustomCycleDays !== existing.customCycleDays);
  await prisma.$transaction(async (transaction) => {
    if (priceChanged) {
      await transaction.subscriptionPriceHistory.create({
        data: {
          userId: user.id,
          subscriptionId: existing.id,
          price: existing.price,
          billingCycle: existing.billingCycle,
          customCycleDays: existing.customCycleDays,
        },
      });
    }
    await transaction.subscription.update({
      where: { id },
      data: {
        ...subscriptionData,
        currency: currencyContext?.ok
          ? currencyContext.data.currency
          : undefined,
        sourceAmountMinor: currencyContext?.ok
          ? currencyContext.data.sourceAmountMinor
          : undefined,
        exchangeRateToJpyScaled: currencyContext?.ok
          ? currencyContext.data.exchangeRateToJpyScaled
          : undefined,
        exchangeRateUpdatedAt: currencyContext?.ok
          ? currencyContext.data.exchangeRateToJpyScaled === null
            ? null
            : optionalDate(exchangeRateUpdatedAt)
              ?? (nextCurrency === existingCurrency
                ? existing.exchangeRateUpdatedAt
                : null)
              ?? new Date()
          : undefined,
        customCycleDays:
          nextBillingCycle === "CUSTOM" ? nextCustomCycleDays : null,
        nextBillingDate: data.nextBillingDate
          ? (parseIsoCalendarDate(data.nextBillingDate) ?? undefined)
          : undefined,
        categoryId:
          data.categoryId === undefined ? undefined : data.categoryId || null,
        paymentMethodId:
          data.paymentMethodId === undefined
            ? undefined
            : data.paymentMethodId || null,
        serviceUrl:
          data.serviceUrl === undefined
            ? undefined
            : optionalUrl(data.serviceUrl),
        cancellationUrl:
          data.cancellationUrl === undefined
            ? undefined
            : optionalUrl(data.cancellationUrl),
        trialEndsAt:
          data.trialEndsAt === undefined
            ? undefined
            : optionalDate(data.trialEndsAt),
        cancellationDeadline:
          data.cancellationDeadline === undefined
            ? undefined
            : optionalDate(data.cancellationDeadline),
        lastReviewedAt:
          data.lastReviewedAt === undefined
            ? undefined
            : optionalDate(data.lastReviewedAt),
        logoUrl:
          data.logoUrl === undefined ? undefined : optionalUrl(data.logoUrl),
        memo: data.memo === undefined ? undefined : data.memo || null,
        defaultAccountingLabel:
          defaultAccountingLabel === undefined
            ? undefined
            : normalizeDefaultAccountingLabel(defaultAccountingLabel),
      },
    });
    if (
      notificationsEnabled !== undefined
      || data.notifyDaysBefore !== undefined
    ) {
      const daysBefore =
        data.notifyDaysBefore
        ?? existingNotificationSetting?.daysBefore
        ?? existing.notifyDaysBefore
        ?? preference?.defaultNotifyDaysBefore
        ?? DEFAULT_NOTIFY_DAYS_BEFORE;
      await transaction.notificationSetting.deleteMany({
        where: { subscriptionId: id, userId: user.id },
      });
      await transaction.notificationSetting.create({
        data: {
          userId: user.id,
          subscriptionId: id,
          daysBefore,
          enabled:
            notificationsEnabled
            ?? existingNotificationSetting?.enabled
            ?? true,
        },
      });
    }
  });
  return NextResponse.json({ id });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  const { id } = await params;
  if (!(await ensureOwner(id, user.id)))
    return NextResponse.json(
      { message: "対象が見つかりません。" },
      { status: 404 },
    );
  const parsed = z
    .object({
      status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]).optional(),
      reviewed: z.boolean().optional(),
      usageFrequency: usageFrequencySchema.optional(),
      cancellationStatus: z
        .enum(["NONE", "CONSIDERING", "PLANNED", "REQUESTED", "COMPLETED"])
        .optional(),
      plannedCancelAt: optionalCalendarDateSchema,
      cancellationMemo: z.string().max(MAX_MEMO_LENGTH).optional(),
    })
    .safeParse(await readJsonBody(request));
  if (!parsed.success)
    return NextResponse.json(
      { message: "入力内容を確認してください。" },
      { status: 400 },
    );
  const hasCancellationSupportUpdate =
    parsed.data.cancellationStatus !== undefined ||
    parsed.data.plannedCancelAt !== undefined ||
    parsed.data.cancellationMemo !== undefined;
  if (hasCancellationSupportUpdate && !isPremiumPlan(user.plan)) {
    return NextResponse.json(
      { message: "解約支援はPremium限定です。" },
      { status: 403 },
    );
  }
  await prisma.subscription.update({
    where: { id },
    data: {
      status: parsed.data.status,
      usageFrequency: parsed.data.usageFrequency,
      lastReviewedAt: parsed.data.reviewed ? new Date() : undefined,
      cancellationStatus: parsed.data.cancellationStatus,
      plannedCancelAt:
        parsed.data.plannedCancelAt === undefined
          ? undefined
          : optionalDate(parsed.data.plannedCancelAt),
      cancellationMemo:
        parsed.data.cancellationMemo === undefined
          ? undefined
          : parsed.data.cancellationMemo || null,
      cancellationCompletedAt:
        parsed.data.cancellationStatus === undefined
          ? undefined
          : parsed.data.cancellationStatus === "COMPLETED"
            ? new Date()
            : null,
    },
  });
  return NextResponse.json({ id });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  const { id } = await params;
  if (!(await ensureOwner(id, user.id)))
    return NextResponse.json(
      { message: "対象が見つかりません。" },
      { status: 404 },
    );
  await prisma.subscription.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
