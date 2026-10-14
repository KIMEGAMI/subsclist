import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { monthlyAmount } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { calculateReviewScore } from "@/lib/review-score";

const idSchema = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  const id = (await params).id;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ message: "契約IDが正しくありません。" }, { status: 400 });
  const subscription = await prisma.subscription.findFirst({
    where: { id, userId: user.id, status: "ACTIVE", deletedAt: null },
    select: {
      id: true, name: true, price: true, billingCycle: true, customCycleDays: true, priority: true, usageFrequency: true, businessUsePercent: true,
      usageRecords: { orderBy: { usedDate: "desc" }, take: 1, select: { usedDate: true } },
      serviceMaster: { select: { priceChanges: { where: { verified: true }, orderBy: { createdAt: "desc" }, take: 1, select: { changeAmount: true } }, alternativesFrom: { take: 10, select: { alternativeService: { select: { priceSnapshots: { where: { trustLevel: "OFFICIAL", currency: "JPY" }, orderBy: { fetchedAt: "desc" }, take: 1, select: { amount: true, billingCycle: true } } } } } } } },
    },
  });
  if (!subscription) return NextResponse.json({ message: "契約が見つかりません。" }, { status: 404 });
  const lastUsedAt = subscription.usageRecords[0]?.usedDate ?? null;
  const daysSinceLastUse = lastUsedAt ? Math.max(0, Math.floor((Date.now() - lastUsedAt.getTime()) / 86_400_000)) : null;
  const alternatives = subscription.serviceMaster?.alternativesFrom ?? [];
  const alternativeSnapshot = alternatives.flatMap((item) => item.alternativeService.priceSnapshots)[0];
  const currentMonthly = monthlyAmount(subscription.price, subscription.billingCycle, subscription.customCycleDays);
  const alternativeMonthly = alternativeSnapshot ? monthlyAmount(alternativeSnapshot.amount, alternativeSnapshot.billingCycle) : null;
  const annualDifference = alternativeMonthly === null ? null : Math.round((currentMonthly - alternativeMonthly) * 12);
  const result = calculateReviewScore({ priceIncreased: (subscription.serviceMaster?.priceChanges[0]?.changeAmount ?? 0) > 0, daysSinceLastUse, alternativeAvailable: alternatives.length > 0, annualDifference, priority: subscription.priority, usageFrequency: subscription.usageFrequency, businessUsePercent: subscription.businessUsePercent });
  return NextResponse.json({ subscription: { id: subscription.id, name: subscription.name }, ...result, inputs: { daysSinceLastUse, currentMonthly: Math.round(currentMonthly), annualDifference } }, { headers: { "Cache-Control": "private, no-store" } });
}
