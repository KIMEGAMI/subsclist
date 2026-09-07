import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const idSchema = z.string().trim().min(1).max(191);
const rollbackConflict = "STATEMENT_PAYMENT_IMPORT_ROLLBACK_CONFLICT";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const parsedId = idSchema.safeParse((await params).id);
  if (!parsedId.success) {
    return NextResponse.json({ message: "取込履歴を確認できませんでした。" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const paymentImport = await transaction.statementPaymentImport.findFirst({
        where: { id: parsedId.data, userId: access.user.id },
        select: {
          id: true,
          undoneAt: true,
          _count: { select: { paymentHistories: true } },
        },
      });
      if (!paymentImport) return null;
      if (paymentImport.undoneAt) throw new Error(rollbackConflict);

      const undoneAt = new Date();
      const claimed = await transaction.statementPaymentImport.updateMany({
        where: { id: paymentImport.id, userId: access.user.id, undoneAt: null },
        data: { undoneAt, undoneCount: paymentImport._count.paymentHistories },
      });
      if (claimed.count !== 1) throw new Error(rollbackConflict);

      const deleted = await transaction.paymentHistory.deleteMany({
        where: {
          userId: access.user.id,
          statementPaymentImportId: paymentImport.id,
        },
      });
      if (deleted.count !== paymentImport._count.paymentHistories) {
        throw new Error(rollbackConflict);
      }
      return { undoneAt, undoneCount: deleted.count };
    });

    if (!result) {
      return NextResponse.json({ message: "取込履歴が見つかりません。" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === rollbackConflict) {
      return NextResponse.json(
        { message: "この取込は既に取り消されたか、支払い履歴が同時に変更されました。画面を再読み込みしてください。" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { message: "取込の取り消しに失敗しました。時間をおいてもう一度お試しください。" },
      { status: 500 },
    );
  }
}
