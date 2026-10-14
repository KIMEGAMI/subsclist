import { NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { serviceMasterIdSchema } from "@/lib/service-master-id";
import { sanitizeNewsText } from "@/lib/news-feed";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const id = (await params).id;
  if (!serviceMasterIdSchema.safeParse(id).success) return NextResponse.json({ message: "サービスIDが正しくありません。" }, { status: 400 });
  const service = await prisma.serviceMaster.findFirst({
    where: { id, status: "ACTIVE" },
    select: { id: true, name: true, newsItems: { where: { sourceType: { in: ["OFFICIAL_RSS", "JAPAN_NEWS_RSS"] }, trustLevel: { in: ["OFFICIAL", "VERIFIED"] } }, orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }], take: 30, select: { id: true, title: true, summaryBase: true, sourceName: true, sourceUrl: true, publishedAt: true, fetchedAt: true, trustLevel: true } } },
  });
  if (!service) return NextResponse.json({ message: "サービスが見つかりません。" }, { status: 404 });
  return NextResponse.json({ service: { id: service.id, name: service.name }, news: service.newsItems.map((item) => ({ ...item, summaryBase: sanitizeNewsText(item.summaryBase), publishedAt: item.publishedAt?.toISOString() ?? null, fetchedAt: item.fetchedAt.toISOString() })) }, { headers: { "Cache-Control": "private, no-store" } });
}
