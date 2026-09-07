import { NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { buildSubscriptionCalendar, type CalendarExportSubscription } from "@/lib/calendar-export";
import { isPremiumPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  if (!isPremiumPlan(user.plan)) {
    return NextResponse.json({ message: "カレンダー書き出しはPremium限定です。" }, { status: 403 });
  }

  const subscriptions = await prisma.subscription.findMany({
    where: { userId: user.id, deletedAt: null, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      price: true,
      billingCycle: true,
      customCycleDays: true,
      nextBillingDate: true,
      trialEndsAt: true,
      cancellationDeadline: true,
    },
    orderBy: [{ nextBillingDate: "asc" }, { name: "asc" }],
  });
  const calendar = buildSubscriptionCalendar(subscriptions as CalendarExportSubscription[]);
  return new Response(calendar, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="subsclist-calendar.ics"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}
