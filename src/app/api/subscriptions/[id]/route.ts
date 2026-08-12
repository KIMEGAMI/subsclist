import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { ALLOWED_URL_PROTOCOLS, MAX_CUSTOM_CYCLE_DAYS, MAX_MEMO_LENGTH, MAX_NOTIFY_DAYS_BEFORE, MAX_SUBSCRIPTION_NAME_LENGTH, MAX_SUBSCRIPTION_PRICE, MIN_CUSTOM_CYCLE_DAYS, PLACEHOLDER_HOSTS } from "@/lib/app-constants";
import { parseIsoCalendarDate } from "@/lib/calendar-date";
import { prisma } from "@/lib/prisma";
import { isPremiumPlan } from "@/lib/plans";
import { ownsSubscriptionRelations } from "@/lib/subscription-relations";

const usageFrequencySchema = z.enum(["DAILY", "WEEKLY", "MONTHLY", "RARELY", "UNKNOWN"]);
const calendarDateSchema = z.string().refine((value) => parseIsoCalendarDate(value) !== null);
const optionalCalendarDateSchema = z.union([z.literal(""), calendarDateSchema]).optional();

const updateSchema = z.object({
  name: z.string().trim().min(1).max(MAX_SUBSCRIPTION_NAME_LENGTH).optional(),
  price: z.coerce.number().int().min(0).max(MAX_SUBSCRIPTION_PRICE).optional(),
  billingCycle: z.enum(["MONTHLY", "YEARLY", "WEEKLY", "CUSTOM"]).optional(),
  customCycleDays: z.preprocess((value) => value === "" || value === null ? undefined : value, z.coerce.number().int().min(MIN_CUSTOM_CYCLE_DAYS).max(MAX_CUSTOM_CYCLE_DAYS).optional()),
  nextBillingDate: calendarDateSchema.optional(),
  categoryId: z.string().optional(),
  paymentMethodId: z.string().optional(),
  status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]).optional(),
  notifyDaysBefore: z.coerce.number().int().min(0).max(MAX_NOTIFY_DAYS_BEFORE).optional(),
  serviceUrl: z.string().optional(),
  cancellationUrl: z.string().optional(),
  trialEndsAt: optionalCalendarDateSchema,
  cancellationDeadline: optionalCalendarDateSchema,
  lastReviewedAt: optionalCalendarDateSchema,
  usageFrequency: usageFrequencySchema.optional(),
  priority: z.enum(["ESSENTIAL", "USEFUL", "OPTIONAL", "UNKNOWN"]).optional(),
  logoUrl: z.string().optional(),
  memo: z.string().max(MAX_MEMO_LENGTH).optional(),
});

function optionalDate(value?: string) {
  return value ? parseIsoCalendarDate(value) : null;
}

function optionalUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if ((PLACEHOLDER_HOSTS as readonly string[]).includes(url.hostname.toLowerCase())) return null;
    return (ALLOWED_URL_PROTOCOLS as readonly string[]).includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

async function ensureOwner(id: string, userId: string) {
  return prisma.subscription.findFirst({ where: { id, userId, deletedAt: null } });
}

async function requestBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "ログインしてください。" }, { status: 401 });
  if (!user.emailVerified) return NextResponse.json({ message: "メール認証が必要です。" }, { status: 403 });
  const { id } = await params;
  const existing = await ensureOwner(id, user.id);
  if (!existing) return NextResponse.json({ message: "対象が見つかりません。" }, { status: 404 });
  const parsed = updateSchema.safeParse(await requestBody(request));
  if (!parsed.success) return NextResponse.json({ message: "入力内容を確認してください。" }, { status: 400 });
  const data = parsed.data;
  const nextBillingCycle = data.billingCycle ?? existing.billingCycle;
  const nextCustomCycleDays = data.customCycleDays ?? existing.customCycleDays;
  if (nextBillingCycle === "CUSTOM" && !nextCustomCycleDays) {
    return NextResponse.json({ message: "カスタム周期の日数を入力してください。" }, { status: 400 });
  }
  if (!await ownsSubscriptionRelations(user.id, data)) {
    return NextResponse.json({ message: "選択したカテゴリまたは支払い方法を使用できません。" }, { status: 400 });
  }
  const priceChanged = (data.price !== undefined && data.price !== existing.price)
    || (data.billingCycle !== undefined && data.billingCycle !== existing.billingCycle)
    || (nextBillingCycle === "CUSTOM" && nextCustomCycleDays !== existing.customCycleDays);
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
        ...data,
        customCycleDays: nextBillingCycle === "CUSTOM" ? nextCustomCycleDays : null,
        nextBillingDate: data.nextBillingDate ? parseIsoCalendarDate(data.nextBillingDate) ?? undefined : undefined,
        categoryId: data.categoryId || null,
        paymentMethodId: data.paymentMethodId || null,
        serviceUrl: data.serviceUrl === undefined ? undefined : optionalUrl(data.serviceUrl),
        cancellationUrl: data.cancellationUrl === undefined ? undefined : optionalUrl(data.cancellationUrl),
        trialEndsAt: data.trialEndsAt === undefined ? undefined : optionalDate(data.trialEndsAt),
        cancellationDeadline: data.cancellationDeadline === undefined ? undefined : optionalDate(data.cancellationDeadline),
        lastReviewedAt: data.lastReviewedAt === undefined ? undefined : optionalDate(data.lastReviewedAt),
        logoUrl: data.logoUrl === undefined ? undefined : data.logoUrl || null,
        memo: data.memo || null,
      },
    });
  });
  return NextResponse.json({ id });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "ログインしてください。" }, { status: 401 });
  if (!user.emailVerified) return NextResponse.json({ message: "メール認証が必要です。" }, { status: 403 });
  const { id } = await params;
  if (!(await ensureOwner(id, user.id))) return NextResponse.json({ message: "対象が見つかりません。" }, { status: 404 });
  const parsed = z.object({
    status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]).optional(),
    reviewed: z.boolean().optional(),
    usageFrequency: usageFrequencySchema.optional(),
    cancellationStatus: z.enum(["NONE", "CONSIDERING", "PLANNED", "REQUESTED", "COMPLETED"]).optional(),
    plannedCancelAt: z.string().optional(),
    cancellationMemo: z.string().max(MAX_MEMO_LENGTH).optional(),
  }).safeParse(await requestBody(request));
  if (!parsed.success) return NextResponse.json({ message: "入力内容を確認してください。" }, { status: 400 });
  const hasCancellationSupportUpdate =
    parsed.data.cancellationStatus !== undefined ||
    parsed.data.plannedCancelAt !== undefined ||
    parsed.data.cancellationMemo !== undefined;
  if (hasCancellationSupportUpdate && !isPremiumPlan(user.plan)) {
    return NextResponse.json({ message: "解約支援はPremium限定です。" }, { status: 403 });
  }
  await prisma.subscription.update({
    where: { id },
    data: {
      status: parsed.data.status,
      usageFrequency: parsed.data.usageFrequency,
      lastReviewedAt: parsed.data.reviewed ? new Date() : undefined,
      cancellationStatus: parsed.data.cancellationStatus,
      plannedCancelAt: parsed.data.plannedCancelAt === undefined ? undefined : optionalDate(parsed.data.plannedCancelAt),
      cancellationMemo: parsed.data.cancellationMemo === undefined ? undefined : parsed.data.cancellationMemo || null,
      cancellationCompletedAt: parsed.data.cancellationStatus === "COMPLETED" ? new Date() : undefined,
    },
  });
  return NextResponse.json({ id });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "ログインしてください。" }, { status: 401 });
  if (!user.emailVerified) return NextResponse.json({ message: "メール認証が必要です。" }, { status: 403 });
  const { id } = await params;
  if (!(await ensureOwner(id, user.id))) return NextResponse.json({ message: "対象が見つかりません。" }, { status: 404 });
  await prisma.subscription.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
