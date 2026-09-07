import { NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { PAYMENT_HISTORY_DUPLICATE_CODE, paymentHistoryDetailsData, paymentHistoryDuplicateFilter, paymentHistoryMutationSchema } from "@/lib/payment-history-input";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;

  const parsed = paymentHistoryMutationSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "入力内容を確認してください。" }, { status: 400 });
  }

  const { id } = await params;
  const target = await prisma.paymentHistory.findFirst({
    where: { id, userId: user.id },
    select: { subscriptionId: true },
  });
  if (!target) {
    return NextResponse.json({ message: "支払い履歴が見つかりません。" }, { status: 404 });
  }
  if (!parsed.data.allowDuplicate) {
    const duplicate = await prisma.paymentHistory.findFirst({
      where: paymentHistoryDuplicateFilter(user.id, target.subscriptionId, parsed.data, id),
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json(
        { code: PAYMENT_HISTORY_DUPLICATE_CODE, message: "同じサブスク・支払い日・金額の履歴が既にあります。" },
        { status: 409 },
      );
    }
  }
  const result = await prisma.paymentHistory.updateMany({
    where: { id, userId: user.id },
    data: paymentHistoryDetailsData(parsed.data),
  });
  if (result.count === 0) {
    return NextResponse.json({ message: "支払い履歴が見つかりません。" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;

  const { id } = await params;
  const result = await prisma.paymentHistory.deleteMany({ where: { id, userId: user.id } });
  if (result.count === 0) return NextResponse.json({ message: "支払い履歴が見つかりません。" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
