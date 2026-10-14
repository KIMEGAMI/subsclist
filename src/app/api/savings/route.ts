import { NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { isPremiumPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function GET() {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  if (!isPremiumPlan(access.user.plan)) {
    return NextResponse.json({ message: "節約実績はPremium限定です。" }, { status: 403 });
  }
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const chartStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const [events, monthTotal, yearTotal, lifetimeTotal, monthlyTotals] = await Promise.all([
    prisma.savingsEvent.findMany({
      where: { userId: access.user.id },
      orderBy: { confirmedAt: "desc" },
      take: 100,
      select: { id: true, type: true, beforeMonthlyAmount: true, afterMonthlyAmount: true, monthlySaving: true, annualSaving: true, confirmedAt: true, note: true, subscription: { select: { id: true, name: true } } },
    }),
    prisma.savingsEvent.aggregate({
      where: { userId: access.user.id, confirmedAt: { gte: monthStart } },
      _sum: { monthlySaving: true },
    }),
    prisma.savingsEvent.aggregate({
      where: { userId: access.user.id, confirmedAt: { gte: yearStart } },
      _sum: { monthlySaving: true },
    }),
    prisma.savingsEvent.aggregate({
      where: { userId: access.user.id },
      _sum: { monthlySaving: true },
    }),
    prisma.$queryRaw<Array<{ month: string; total: bigint | number | string }>>`
      SELECT DATE_FORMAT(confirmedAt, '%Y-%m') AS month, SUM(monthlySaving) AS total
      FROM SavingsEvent
      WHERE userId = ${access.user.id} AND confirmedAt >= ${chartStart}
      GROUP BY DATE_FORMAT(confirmedAt, '%Y-%m')
    `,
  ]);
  const months = Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(chartStart.getUTCFullYear(), chartStart.getUTCMonth() + index, 1)));
  const monthlySavingByKey = new Map(monthlyTotals.map((item) => [item.month, Number(item.total)]));
  return NextResponse.json({
    summary: {
      monthSaving: monthTotal._sum.monthlySaving ?? 0,
      yearSaving: yearTotal._sum.monthlySaving ?? 0,
      lifetimeSaving: lifetimeTotal._sum.monthlySaving ?? 0,
    },
    monthly: months.map((month) => ({ key: monthKey(month), saving: monthlySavingByKey.get(monthKey(month)) ?? 0 })),
    events: events.map((event) => ({ ...event, confirmedAt: event.confirmedAt.toISOString() })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
