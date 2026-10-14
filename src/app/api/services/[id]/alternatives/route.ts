import { NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { serviceMasterIdSchema } from "@/lib/service-master-id";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const id = (await params).id;
  if (!serviceMasterIdSchema.safeParse(id).success) return NextResponse.json({ message: "サービスIDが正しくありません。" }, { status: 400 });
  const service = await prisma.serviceMaster.findFirst({
    where: { id, status: "ACTIVE" },
    select: { id: true, name: true, alternativesFrom: { orderBy: { createdAt: "asc" }, take: 30, select: { id: true, categoryMatch: true, featureSimilarity: true, note: true, alternativeService: { select: { id: true, name: true, category: true, officialUrl: true, priceSnapshots: { where: { trustLevel: "OFFICIAL" }, orderBy: { fetchedAt: "desc" }, take: 1, select: { planName: true, billingCycle: true, currency: true, amount: true, taxIncluded: true, sourceUrl: true, fetchedAt: true } } } } } } },
  });
  if (!service) return NextResponse.json({ message: "サービスが見つかりません。" }, { status: 404 });
  return NextResponse.json({ service: { id: service.id, name: service.name }, alternatives: service.alternativesFrom.map((item) => ({ id: item.id, categoryMatch: item.categoryMatch, featureSimilarity: item.featureSimilarity, note: item.note, service: { ...item.alternativeService, priceSnapshots: item.alternativeService.priceSnapshots.map((snapshot) => ({ ...snapshot, fetchedAt: snapshot.fetchedAt.toISOString() })) } })) }, { headers: { "Cache-Control": "private, no-store" } });
}
