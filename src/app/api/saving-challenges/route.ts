import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { MAX_RENEWAL_DECISION_REASON_LENGTH } from "@/lib/app-constants";
import { monthlyAmount, nextBillingOccurrence } from "@/lib/billing";
import { isPremiumPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";
import { renewalDecisionPeriod } from "@/lib/renewal-decision";

const decisionSchema = z.object({
  subscriptionId: z.string().min(1),
  status: z.enum(["CONTINUE", "CANCEL_PLANNED", "HOLD"]),
  reason: z.string().trim().max(MAX_RENEWAL_DECISION_REASON_LENGTH).optional(),
});

export async function PUT(request: Request) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  if (!isPremiumPlan(user.plan)) {
    return NextResponse.json(
      { message: "更新判断の記録はPremium限定です。" },
      { status: 403 },
    );
  }

  const parsed = decisionSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "入力内容を確認してください。" },
      { status: 400 },
    );
  }

  const subscription = await prisma.subscription.findFirst({
    where: {
      id: parsed.data.subscriptionId,
      userId: user.id,
      deletedAt: null,
      status: "ACTIVE",
    },
    select: {
      id: true,
      price: true,
      billingCycle: true,
      customCycleDays: true,
      nextBillingDate: true,
    },
  });
  if (!subscription) {
    return NextResponse.json(
      { message: "対象が見つかりません。" },
      { status: 404 },
    );
  }

  const now = new Date();
  const period = renewalDecisionPeriod(now);
  const renewalDate = nextBillingOccurrence(
    subscription.nextBillingDate,
    subscription.billingCycle,
    subscription.customCycleDays,
    now,
  );
  const potentialMonthlySaving = Math.round(
    monthlyAmount(
      subscription.price,
      subscription.billingCycle,
      subscription.customCycleDays,
    ),
  );

  await prisma.$transaction([
    prisma.savingChallenge.upsert({
      where: {
        userId_subscriptionId_year_month: {
          userId: user.id,
          subscriptionId: subscription.id,
          year: period.year,
          month: period.month,
        },
      },
      create: {
        userId: user.id,
        subscriptionId: subscription.id,
        status: parsed.data.status,
        reason: parsed.data.reason || null,
        potentialMonthlySaving,
        renewalDate,
        decidedAt: now,
        year: period.year,
        month: period.month,
      },
      update: {
        status: parsed.data.status,
        reason: parsed.data.reason || null,
        potentialMonthlySaving,
        renewalDate,
        decidedAt: now,
      },
    }),
    prisma.subscription.update({
      where: { id: subscription.id },
      data: { lastReviewedAt: now },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
