import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isPremiumPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { japanCalendarDate } from "@/lib/subscription-usage";

const challengeSchema = z.object({
  subscriptionId: z.string().min(1),
  status: z.enum(["CONTINUE", "CANCEL_PLANNED", "HOLD"]),
  potentialMonthlySaving: z.coerce.number().int().min(0).max(1_000_000),
});

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "ログインしてください。" }, { status: 401 });
  if (!user.emailVerified) return NextResponse.json({ message: "メール認証が必要です。" }, { status: 403 });
  if (!isPremiumPlan(user.plan)) return NextResponse.json({ message: "断捨離チャレンジはPremium限定です。" }, { status: 403 });

  const parsed = challengeSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ message: "入力内容を確認してください。" }, { status: 400 });

  const subscription = await prisma.subscription.findFirst({
    where: { id: parsed.data.subscriptionId, userId: user.id, deletedAt: null, status: "ACTIVE" },
    select: { id: true },
  });
  if (!subscription) return NextResponse.json({ message: "対象が見つかりません。" }, { status: 404 });

  const now = japanCalendarDate();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  await prisma.savingChallenge.upsert({
    where: { userId_year_month: { userId: user.id, year, month } },
    create: { userId: user.id, subscriptionId: subscription.id, status: parsed.data.status, potentialMonthlySaving: parsed.data.potentialMonthlySaving, year, month },
    update: { subscriptionId: subscription.id, status: parsed.data.status, potentialMonthlySaving: parsed.data.potentialMonthlySaving },
  });

  return NextResponse.json({ ok: true });
}
