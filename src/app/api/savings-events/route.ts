import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { monthlyAmount } from "@/lib/billing";
import { isPremiumPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";

const eventSchema = z.object({
  subscriptionId: z.string().trim().min(1).max(191),
  idempotencyKey: z.string().min(20).max(128).regex(/^[A-Za-z0-9_-]+$/),
  type: z.enum(["CANCELLED", "PLAN_DOWNGRADE", "SWITCHED", "PRICE_RENEGOTIATED"]),
  afterMonthlyAmount: z.number().int().nonnegative().max(100_000_000),
  note: z.string().trim().max(500).optional(),
});

export async function GET() {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  if (!isPremiumPlan(access.user.plan)) {
    return NextResponse.json({ message: "節約実績はPremium限定です。" }, { status: 403 });
  }
  const events = await prisma.savingsEvent.findMany({ where: { userId: access.user.id }, orderBy: { confirmedAt: "desc" }, take: 100, select: { id: true, type: true, beforeMonthlyAmount: true, afterMonthlyAmount: true, monthlySaving: true, annualSaving: true, confirmedAt: true, note: true, subscription: { select: { name: true } } } });
  return NextResponse.json({ events }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  if (!isPremiumPlan(access.user.plan)) {
    return NextResponse.json({ message: "節約実績はPremium限定です。" }, { status: 403 });
  }
  const parsed = eventSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: "節約実績の入力内容を確認してください。" }, { status: 400 });
  const subscription = await prisma.subscription.findFirst({ where: { id: parsed.data.subscriptionId, userId: access.user.id, deletedAt: null }, select: { id: true, price: true, billingCycle: true, customCycleDays: true, name: true } });
  if (!subscription) return NextResponse.json({ message: "対象の契約が見つかりません。" }, { status: 404 });
  const beforeMonthlyAmount = Math.round(monthlyAmount(subscription.price, subscription.billingCycle, subscription.customCycleDays));
  const afterMonthlyAmount = parsed.data.type === "CANCELLED" ? 0 : parsed.data.afterMonthlyAmount;
  const monthlySaving = beforeMonthlyAmount - afterMonthlyAmount;
  if (monthlySaving <= 0) return NextResponse.json({ message: "現在より低い月額を入力してください。" }, { status: 400 });
  const dedupeKey = createHash("sha256")
    .update(`${access.user.id}:${parsed.data.idempotencyKey}`)
    .digest("hex");
  const existing = await prisma.savingsEvent.findUnique({ where: { dedupeKey }, select: { id: true, monthlySaving: true, annualSaving: true } });
  if (existing) return NextResponse.json({ ok: true, event: existing, duplicate: true });
  try {
    const event = await prisma.savingsEvent.create({ data: { userId: access.user.id, subscriptionId: subscription.id, type: parsed.data.type, beforeMonthlyAmount, afterMonthlyAmount, monthlySaving, annualSaving: monthlySaving * 12, dedupeKey, note: parsed.data.note || null }, select: { id: true, monthlySaving: true, annualSaving: true } });
    return NextResponse.json({ ok: true, event }, { status: 201 });
  } catch (error) {
    if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2002") throw error;
    const duplicate = await prisma.savingsEvent.findUnique({ where: { dedupeKey }, select: { id: true, monthlySaving: true, annualSaving: true } });
    if (!duplicate) throw error;
    return NextResponse.json({ ok: true, event: duplicate, duplicate: true });
  }
}
