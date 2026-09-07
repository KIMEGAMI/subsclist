import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";
import {
  startOfJapanWeek,
  WEEKLY_USAGE_RANGES,
} from "@/lib/subscription-weekly-review";

type RouteContext = { params: Promise<{ id: string }> };

const schema = z.object({
  usageRange: z.enum(WEEKLY_USAGE_RANGES),
});

export async function PUT(request: Request, { params }: RouteContext) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  const { id } = await params;
  const parsed = schema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "今週の利用日数を選択してください。" },
      { status: 400 },
    );
  }

  const subscription = await prisma.subscription.findFirst({
    where: { id, userId: user.id, deletedAt: null, status: "ACTIVE" },
    select: { id: true },
  });
  if (!subscription) {
    return NextResponse.json(
      { message: "対象が見つかりません。" },
      { status: 404 },
    );
  }

  const weekStart = startOfJapanWeek();
  const dailyUsage = await prisma.subscriptionUsage.findFirst({
    where: {
      userId: user.id,
      subscriptionId: subscription.id,
      usedDate: { gte: weekStart },
    },
    select: { id: true },
  });
  if (dailyUsage) {
    return NextResponse.json(
      { message: "今週は日別の利用記録があるため、追加の週次回答は不要です。" },
      { status: 409 },
    );
  }

  await prisma.$transaction([
    prisma.weeklyUsageReview.upsert({
      where: {
        userId_subscriptionId_weekStart: {
          userId: user.id,
          subscriptionId: subscription.id,
          weekStart,
        },
      },
      create: {
        userId: user.id,
        subscriptionId: subscription.id,
        weekStart,
        usageRange: parsed.data.usageRange,
      },
      update: { usageRange: parsed.data.usageRange },
    }),
    prisma.subscription.update({
      where: { id: subscription.id },
      data: { lastReviewedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
