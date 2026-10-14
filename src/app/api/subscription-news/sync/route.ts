import { NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { accessibleNewsServiceIds } from "@/lib/news-access";
import { isNewsManualSyncRateLimited } from "@/lib/news-manual-sync-rate-limit";
import { OfficialNewsSyncBusyError, syncOfficialNewsFeeds } from "@/lib/official-news-sync";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  if (isNewsManualSyncRateLimited(access.user.id)) {
    return NextResponse.json(
      { message: "短時間に何度も更新できません。1分後にもう一度お試しください。" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const [services, subscriptions] = await Promise.all([
    prisma.serviceMaster.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
    prisma.subscription.findMany({ where: { userId: access.user.id, status: "ACTIVE", deletedAt: null }, select: { name: true, serviceMasterId: true } }),
  ]);
  const serviceIds = new Set(accessibleNewsServiceIds({ subscriptions, services }));

  try {
    const result = await syncOfficialNewsFeeds({ serviceIds: [...serviceIds] });
    return NextResponse.json({ ok: result.failedServices.length === 0, ...result });
  } catch (error) {
    if (error instanceof OfficialNewsSyncBusyError) {
      return NextResponse.json({ message: "ニュースを更新中です。少し待ってからもう一度お試しください。" }, { status: 409 });
    }
    throw error;
  }
}
