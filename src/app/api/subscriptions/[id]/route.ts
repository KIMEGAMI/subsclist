import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPremiumPlan } from "@/lib/plans";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  price: z.coerce.number().min(0).optional(),
  billingCycle: z.enum(["MONTHLY", "YEARLY", "WEEKLY", "CUSTOM"]).optional(),
  nextBillingDate: z.string().min(1).optional(),
  categoryId: z.string().optional(),
  paymentMethodId: z.string().optional(),
  status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]).optional(),
  notifyDaysBefore: z.coerce.number().min(0).optional(),
  serviceUrl: z.string().optional(),
  cancellationUrl: z.string().optional(),
  trialEndsAt: z.string().optional(),
  cancellationDeadline: z.string().optional(),
  lastReviewedAt: z.string().optional(),
  usageFrequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "RARELY", "UNKNOWN"]).optional(),
  priority: z.enum(["ESSENTIAL", "USEFUL", "OPTIONAL", "UNKNOWN"]).optional(),
  logoUrl: z.string().optional(),
  memo: z.string().max(1000).optional(),
});

function optionalDate(value?: string) {
  return value ? new Date(value) : null;
}

function optionalUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (["example.com", "www.example.com"].includes(url.hostname.toLowerCase())) return null;
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

async function ensureOwner(id: string, userId: string) {
  const subscription = await prisma.subscription.findFirst({ where: { id, userId, deletedAt: null } });
  return subscription;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "ログインしてください。" }, { status: 401 });
  if (!user.emailVerified) return NextResponse.json({ message: "メール認証が必要です。" }, { status: 403 });
  const { id } = await params;
  if (!(await ensureOwner(id, user.id))) return NextResponse.json({ message: "対象が見つかりません。" }, { status: 404 });
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "入力内容を確認してください。" }, { status: 400 });
  const data = parsed.data;
  await prisma.subscription.update({
    where: { id },
    data: {
      ...data,
      nextBillingDate: data.nextBillingDate ? new Date(data.nextBillingDate) : undefined,
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
    cancellationStatus: z.enum(["NONE", "CONSIDERING", "PLANNED", "REQUESTED", "COMPLETED"]).optional(),
    plannedCancelAt: z.string().optional(),
    cancellationMemo: z.string().max(1000).optional(),
  }).safeParse(await request.json());
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
