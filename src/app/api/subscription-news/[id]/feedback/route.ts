import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { accessibleNewsServiceIds } from "@/lib/news-access";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";
import { isNewsFeedbackRateLimited } from "@/lib/news-feedback-rate-limit";

const schema = z.object({ feedback: z.enum(["USEFUL", "NOT_INTERESTED"]) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  if (isNewsFeedbackRateLimited(access.user.id)) {
    return NextResponse.json({ message: "フィードバックの送信回数が上限に達しました。1分後にもう一度お試しください。" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  const parsed = schema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: "フィードバックの内容が不正です。" }, { status: 400 });
  const newsItemId = (await params).id;
  const [item, services, subscriptions] = await Promise.all([
    prisma.newsItem.findUnique({ where: { id: newsItemId }, select: { id: true, serviceId: true, sourceType: true } }),
    prisma.serviceMaster.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
    prisma.subscription.findMany({ where: { userId: access.user.id, status: "ACTIVE", deletedAt: null }, select: { name: true, serviceMasterId: true } }),
  ]);
  if (!item || !["OFFICIAL_RSS", "JAPAN_NEWS_RSS"].includes(item.sourceType) || !item.serviceId) return NextResponse.json({ message: "対象ニュースが見つかりません。" }, { status: 404 });
  const allowedServiceIds = new Set(accessibleNewsServiceIds({ subscriptions, services }));
  if (!allowedServiceIds.has(item.serviceId)) return NextResponse.json({ message: "対象ニュースが見つかりません。" }, { status: 404 });
  await prisma.userNewsFeedback.upsert({ where: { userId_newsItemId: { userId: access.user.id, newsItemId: item.id } }, create: { userId: access.user.id, newsItemId: item.id, feedback: parsed.data.feedback, clickedAt: new Date() }, update: { feedback: parsed.data.feedback, clickedAt: new Date() } });
  return NextResponse.json({ ok: true, feedback: parsed.data.feedback });
}
