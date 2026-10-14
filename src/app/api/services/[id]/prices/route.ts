import { NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { serviceMasterIdSchema } from "@/lib/service-master-id";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const id = (await params).id;
  if (!serviceMasterIdSchema.safeParse(id).success) {
    return NextResponse.json({ message: "サービスIDが正しくありません。" }, { status: 400 });
  }

  const service = await prisma.serviceMaster.findFirst({
    where: { id, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      priceSnapshots: {
        where: { trustLevel: "OFFICIAL" },
        orderBy: { fetchedAt: "desc" },
        take: 60,
        select: { id: true, planName: true, billingCycle: true, currency: true, amount: true, taxIncluded: true, sourceUrl: true, fetchedAt: true, effectiveAt: true },
      },
      priceChanges: {
        where: { verified: true },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, planName: true, oldAmount: true, newAmount: true, changeAmount: true, changePercent: true, currency: true, sourceUrl: true, effectiveAt: true, createdAt: true },
      },
    },
  });
  if (!service) return NextResponse.json({ message: "サービスが見つかりません。" }, { status: 404 });

  return NextResponse.json({
    service: { id: service.id, name: service.name },
    snapshots: service.priceSnapshots.map((snapshot) => ({ ...snapshot, fetchedAt: snapshot.fetchedAt.toISOString(), effectiveAt: snapshot.effectiveAt?.toISOString() ?? null })),
    changes: service.priceChanges.map((change) => ({ ...change, effectiveAt: change.effectiveAt?.toISOString() ?? null, createdAt: change.createdAt.toISOString() })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
