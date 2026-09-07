import { NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { paymentHistoryBulkOrganizationSchema } from "@/lib/payment-history-bulk-organization";
import { isPremiumPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";

const targetMismatchError = "PAYMENT_HISTORY_BULK_TARGET_MISMATCH";

export async function POST(request: Request) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;

  if (!isPremiumPlan(user.plan)) {
    return NextResponse.json(
      { message: "支払い履歴の一括整理はPremium限定です。" },
      { status: 403 },
    );
  }

  const parsed = paymentHistoryBulkOrganizationSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "対象の支払い履歴と整理用科目を確認してください。" },
      { status: 400 },
    );
  }

  try {
    const updatedCount = await prisma.$transaction(async (transaction) => {
      const targetCount = await transaction.paymentHistory.count({
        where: {
          id: { in: parsed.data.paymentHistoryIds },
          userId: user.id,
          accountingLabel: null,
        },
      });
      if (targetCount !== parsed.data.paymentHistoryIds.length) throw new Error(targetMismatchError);

      const result = await transaction.paymentHistory.updateMany({
        where: {
          id: { in: parsed.data.paymentHistoryIds },
          userId: user.id,
          accountingLabel: null,
        },
        data: { accountingLabel: parsed.data.accountingLabel },
      });
      return result.count;
    });
    return NextResponse.json({ ok: true, updatedCount });
  } catch (error) {
    if (error instanceof Error && error.message === targetMismatchError) {
      return NextResponse.json(
        { message: "対象の支払い履歴が更新されています。ページを再読み込みしてください。" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { message: "支払い履歴の一括整理に失敗しました。時間をおいてもう一度お試しください。" },
      { status: 500 },
    );
  }
}
