import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";
import { serviceMasterIdSchema } from "@/lib/service-master-id";

const schema = z.object({
  serviceId: serviceMasterIdSchema,
  watchPrice: z.boolean().optional(),
  watchNews: z.boolean().optional(),
  watchNewPlan: z.boolean().optional(),
});

export async function POST(request: Request) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const parsed = schema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: "入力内容を確認してください。" }, { status: 400 });
  const service = await prisma.serviceMaster.findFirst({ where: { id: parsed.data.serviceId, status: "ACTIVE" }, select: { id: true } });
  if (!service) return NextResponse.json({ message: "対象サービスが見つかりません。" }, { status: 404 });
  await prisma.serviceWatchlist.upsert({
    where: { userId_serviceId: { userId: access.user.id, serviceId: service.id } },
    create: { userId: access.user.id, serviceId: service.id, watchPrice: parsed.data.watchPrice ?? true, watchNews: parsed.data.watchNews ?? true, watchNewPlan: parsed.data.watchNewPlan ?? true },
    update: { watchPrice: parsed.data.watchPrice, watchNews: parsed.data.watchNews, watchNewPlan: parsed.data.watchNewPlan },
  });
  return NextResponse.json({ ok: true });
}
