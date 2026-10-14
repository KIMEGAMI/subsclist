import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { japanCalendarDate } from "@/lib/subscription-usage";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";

const bodySchema = z.object({
  usedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "利用日はYYYY-MM-DD形式で入力してください。").optional(),
}).strict();

function parseDate(value: string | undefined) {
  const date = value ? new Date(`${value}T00:00:00.000Z`) : japanCalendarDate();
  if (Number.isNaN(date.getTime()) || (value && date.toISOString().slice(0, 10) !== value)) return null;
  return date;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const parsed = bodySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: "利用日の入力内容を確認してください。" }, { status: 400 });
  const usedDate = parseDate(parsed.data.usedDate);
  if (!usedDate || usedDate > japanCalendarDate()) return NextResponse.json({ message: "利用日は今日以前の日付を指定してください。" }, { status: 400 });
  const id = (await params).id;
  const subscription = await prisma.subscription.findFirst({ where: { id, userId: access.user.id, status: "ACTIVE", deletedAt: null }, select: { id: true } });
  if (!subscription) return NextResponse.json({ message: "対象が見つかりません。" }, { status: 404 });
  const usage = await prisma.subscriptionUsage.upsert({ where: { userId_subscriptionId_usedDate: { userId: access.user.id, subscriptionId: subscription.id, usedDate } }, create: { userId: access.user.id, subscriptionId: subscription.id, usedDate, usageCount: 1 }, update: { usageCount: { increment: 1 } }, select: { usedDate: true, usageCount: true } });
  return NextResponse.json({ ok: true, usage: { usedDate: usage.usedDate.toISOString().slice(0, 10), usageCount: usage.usageCount } }, { headers: { "Cache-Control": "private, no-store" } });
}
