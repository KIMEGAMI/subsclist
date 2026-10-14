import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { rankNews } from "@/lib/news-ranking";
import { sanitizeNewsText } from "@/lib/news-feed";

const querySchema = z.object({
  category: z.string().trim().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export async function GET(request: Request) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({ category: params.get("category") ?? undefined, limit: params.get("limit") ?? undefined });
  if (!parsed.success) return NextResponse.json({ message: "ニュースの検索条件が正しくありません。" }, { status: 400 });
  const now = new Date();
  const items = await prisma.newsItem.findMany({
    where: {
      category: parsed.data.category ? parsed.data.category : undefined,
      service: { subscriptions: { some: { userId: user.id, status: "ACTIVE", deletedAt: null } } },
      trustLevel: { in: ["OFFICIAL", "VERIFIED"] },
    },
    orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
    take: 100,
    select: { id: true, title: true, summaryBase: true, sourceName: true, sourceUrl: true, publishedAt: true, fetchedAt: true, category: true, importance: true, trustLevel: true, service: { select: { id: true, name: true, subscriptions: { where: { userId: user.id, status: "ACTIVE", deletedAt: null }, select: { id: true } } } }, feedback: { where: { userId: user.id }, select: { feedback: true, clickedAt: true } } },
  });
  const news = items.filter((item) => item.service).map((item) => {
    const service = item.service;
    if (!service) return null;
    const contracted = service.subscriptions.length > 0;
    return {
      id: item.id,
      title: item.title,
      summary: sanitizeNewsText(item.summaryBase),
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      publishedAt: item.publishedAt?.toISOString() ?? null,
      fetchedAt: item.fetchedAt.toISOString(),
      category: item.category,
      trustLevel: item.trustLevel,
      service: { id: service.id, name: service.name },
      score: rankNews({ category: item.category, importance: item.importance, publishedAt: item.publishedAt, contracted, now }),
      reasons: contracted ? ["契約中のサービス"] : [],
      feedback: item.feedback[0] ?? null,
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null).sort((left, right) => right.score - left.score || (right.publishedAt ?? "").localeCompare(left.publishedAt ?? "")).slice(0, parsed.data.limit);
  return NextResponse.json({ news }, { headers: { "Cache-Control": "private, no-store" } });
}
