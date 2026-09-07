import { NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { limitByPlan } from "@/lib/plans";
import { readJsonBody } from "@/lib/request-body";
import {
  bulkSubscriptionUpdateData,
  bulkSubscriptionUpdateSchema,
  selectedIdsAreVisible,
} from "@/lib/subscription-bulk-update";
import { ownsSubscriptionRelations } from "@/lib/subscription-relations";

const targetMismatchError = "BULK_SUBSCRIPTION_TARGET_MISMATCH";

export async function POST(request: Request) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;

  const parsed = bulkSubscriptionUpdateSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "対象と更新内容を確認してください。" },
      { status: 400 },
    );
  }

  const input = parsed.data;
  if (!(await ownsSubscriptionRelations(user.id, input))) {
    return NextResponse.json(
      { message: "選択したカテゴリまたは支払い方法を使用できません。" },
      { status: 400 },
    );
  }

  const ownedSubscriptions = await prisma.subscription.findMany({
    where: { userId: user.id, deletedAt: null },
    orderBy: { nextBillingDate: "asc" },
    select: { id: true },
  });
  const visibleIds = limitByPlan(ownedSubscriptions, user.plan).map((item) => item.id);
  if (!selectedIdsAreVisible(input.subscriptionIds, visibleIds)) {
    return NextResponse.json(
      { message: "更新できない契約が含まれています。ページを再読み込みしてください。" },
      { status: 403 },
    );
  }

  try {
    const updatedCount = await prisma.$transaction(async (transaction) => {
      const targetCount = await transaction.subscription.count({
        where: {
          id: { in: input.subscriptionIds },
          userId: user.id,
          deletedAt: null,
        },
      });
      if (targetCount !== input.subscriptionIds.length) throw new Error(targetMismatchError);
      const result = await transaction.subscription.updateMany({
        where: {
          id: { in: input.subscriptionIds },
          userId: user.id,
          deletedAt: null,
        },
        data: bulkSubscriptionUpdateData(input),
      });
      return result.count;
    });
    return NextResponse.json({ ok: true, updatedCount });
  } catch (error) {
    if (error instanceof Error && error.message === targetMismatchError) {
      return NextResponse.json(
        { message: "契約情報が更新されています。ページを再読み込みしてください。" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { message: "一括更新に失敗しました。時間をおいてもう一度お試しください。" },
      { status: 500 },
    );
  }
}
