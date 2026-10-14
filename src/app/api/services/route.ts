import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const searchSchema = z.object({
  q: z.string().trim().max(100, "検索語は100文字以内で入力してください。").optional().default(""),
}).strict();

export async function GET(request: Request) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  const parsed = searchSchema.safeParse({ q: new URL(request.url).searchParams.get("q") ?? "" });
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "検索条件が正しくありません。" }, { status: 400 });
  const query = parsed.data.q;
  const services = await prisma.serviceMaster.findMany({
    where: {
      status: "ACTIVE",
      ...(query ? { OR: [{ name: { contains: query } }, { slug: { contains: query } }, { category: { contains: query } }] } : {}),
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 50,
    select: { id: true, name: true, slug: true, category: true, officialUrl: true, pricingUrl: true, newsUrl: true, watchlistItems: { where: { userId: user.id }, select: { id: true } } },
  });
  return NextResponse.json({ services: services.map((service) => ({ id: service.id, name: service.name, slug: service.slug, category: service.category, officialUrl: service.officialUrl, pricingUrl: service.pricingUrl, newsUrl: service.newsUrl, watching: service.watchlistItems.length > 0 })) }, { headers: { "Cache-Control": "private, no-store" } });
}
