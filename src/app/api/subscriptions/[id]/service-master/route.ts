import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";
import { serviceMasterIdSchema } from "@/lib/service-master-id";

const schema = z.object({ serviceId: z.union([serviceMasterIdSchema, z.literal("")]) });

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const parsed = schema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: "サービスを選択してください。" }, { status: 400 });
  const { id } = await params;
  const subscription = await prisma.subscription.findFirst({ where: { id, userId: access.user.id, deletedAt: null }, select: { id: true } });
  if (!subscription) return NextResponse.json({ message: "対象が見つかりません。" }, { status: 404 });
  if (parsed.data.serviceId) {
    const service = await prisma.serviceMaster.findFirst({ where: { id: parsed.data.serviceId, status: "ACTIVE" }, select: { id: true } });
    if (!service) return NextResponse.json({ message: "選択したサービスが見つかりません。" }, { status: 404 });
  }
  await prisma.subscription.update({ where: { id: subscription.id }, data: { serviceMasterId: parsed.data.serviceId || null } });
  return NextResponse.json({ ok: true });
}
