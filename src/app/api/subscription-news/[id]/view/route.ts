import { NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { accessibleNewsServiceIds } from "@/lib/news-access";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const id = (await params).id;
  const [item, services, subscriptions] = await Promise.all([
    prisma.newsItem.findUnique({ where: { id }, select: { id: true, serviceId: true, sourceType: true } }),
    prisma.serviceMaster.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
    prisma.subscription.findMany({ where: { userId: access.user.id, status: "ACTIVE", deletedAt: null }, select: { name: true, serviceMasterId: true } }),
  ]);
  if (!item || !["OFFICIAL_RSS", "JAPAN_NEWS_RSS"].includes(item.sourceType) || !item.serviceId) return NextResponse.json({ message: "対象ニュースが見つかりません。" }, { status: 404 });
  const allowedServiceIds = new Set(accessibleNewsServiceIds({ subscriptions, services }));
  if (!allowedServiceIds.has(item.serviceId)) return NextResponse.json({ message: "対象ニュースが見つかりません。" }, { status: 404 });
  await prisma.userNewsFeedback.upsert({ where: { userId_newsItemId: { userId: access.user.id, newsItemId: item.id } }, create: { userId: access.user.id, newsItemId: item.id, feedback: "VIEWED", clickedAt: new Date() }, update: { clickedAt: new Date() } });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
