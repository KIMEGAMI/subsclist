import { NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { serviceMasterIdSchema } from "@/lib/service-master-id";

export async function DELETE(_request: Request, { params }: { params: Promise<{ serviceId: string }> }) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const parsed = serviceMasterIdSchema.safeParse((await params).serviceId);
  if (!parsed.success) return NextResponse.json({ message: "対象サービスが不正です。" }, { status: 400 });
  await prisma.serviceWatchlist.deleteMany({ where: { userId: access.user.id, serviceId: parsed.data } });
  return NextResponse.json({ ok: true });
}
