import { NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import {
  notificationSnoozeInputSchema,
  notificationSnoozeUntil,
} from "@/lib/notification-snooze";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { id } = await params;
  const parsed = notificationSnoozeInputSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "通知の一時停止期間を選択してください。" },
      { status: 400 },
    );
  }

  const ownedSubscription = await prisma.subscription.findFirst({
    where: { id, userId: access.user.id, deletedAt: null },
    select: { id: true },
  });
  if (!ownedSubscription) {
    return NextResponse.json(
      { message: "対象のサブスクリプションが見つかりません。" },
      { status: 404 },
    );
  }

  const notificationSnoozedUntil = notificationSnoozeUntil(parsed.data.duration);
  const result = await prisma.subscription.updateMany({
    where: { id, userId: access.user.id, deletedAt: null },
    data: { notificationSnoozedUntil },
  });
  if (result.count !== 1) {
    return NextResponse.json(
      { message: "通知設定が変更されたため、ページを再読み込みしてください。" },
      { status: 409 },
    );
  }

  return NextResponse.json({
    id,
    notificationSnoozedUntil: notificationSnoozedUntil?.toISOString() ?? null,
    message: notificationSnoozedUntil
      ? "この契約の通知を一時停止しました。"
      : "この契約の通知を再開しました。",
  });
}
