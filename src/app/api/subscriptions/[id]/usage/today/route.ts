import { NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { japanCalendarDate } from "@/lib/subscription-usage";

type RouteContext = { params: Promise<{ id: string }> };

async function verifiedOwnerSubscription(id: string) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return { error: access.response };
  const { user } = access;

  const subscription = await prisma.subscription.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    select: { id: true },
  });
  if (!subscription) return { error: NextResponse.json({ message: "対象が見つかりません。" }, { status: 404 }) };

  return { user, subscription };
}

export async function PUT(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const result = await verifiedOwnerSubscription(id);
  if ("error" in result) return result.error;

  const usedDate = japanCalendarDate();
  await prisma.subscriptionUsage.upsert({
    where: {
      userId_subscriptionId_usedDate: {
        userId: result.user.id,
        subscriptionId: result.subscription.id,
        usedDate,
      },
    },
    create: {
      userId: result.user.id,
      subscriptionId: result.subscription.id,
      usedDate,
    },
    update: {},
  });

  return NextResponse.json({ usedToday: true });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const result = await verifiedOwnerSubscription(id);
  if ("error" in result) return result.error;

  await prisma.subscriptionUsage.deleteMany({
    where: {
      userId: result.user.id,
      subscriptionId: result.subscription.id,
      usedDate: japanCalendarDate(),
    },
  });

  return NextResponse.json({ usedToday: false });
}
