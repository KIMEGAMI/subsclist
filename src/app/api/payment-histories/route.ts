import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { PAYMENT_HISTORY_DUPLICATE_CODE, paymentHistoryDetailsData, paymentHistoryDuplicateFilter, paymentHistoryMutationSchema } from "@/lib/payment-history-input";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";
import {
  rememberAccountingLabelSchema,
} from "@/lib/subscription-default-accounting";

const schema = paymentHistoryMutationSchema.extend({
  subscriptionId: z.string().min(1),
  rememberAccountingLabel: rememberAccountingLabelSchema,
});

export async function POST(request: Request) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;

  const parsed = schema.safeParse(await readJsonBody(request));
  if (!parsed.success)
    return NextResponse.json(
      { message: "入力内容を確認してください。" },
      { status: 400 },
    );

  const subscription = await prisma.subscription.findFirst({
    where: { id: parsed.data.subscriptionId, userId: user.id, deletedAt: null },
    select: {
      id: true,
      name: true,
      businessUsePercent: true,
      category: { select: { name: true } },
      paymentMethod: { select: { name: true } },
    },
  });
  if (!subscription)
    return NextResponse.json(
      { message: "対象のサブスクが見つかりません。" },
      { status: 404 },
    );

  if (!parsed.data.allowDuplicate) {
    const duplicate = await prisma.paymentHistory.findFirst({
      where: paymentHistoryDuplicateFilter(user.id, subscription.id, parsed.data),
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json(
        { code: PAYMENT_HISTORY_DUPLICATE_CODE, message: "同じサブスク・支払い日・金額の履歴が既にあります。" },
        { status: 409 },
      );
    }
  }

  const details = paymentHistoryDetailsData(parsed.data);
  if (parsed.data.rememberAccountingLabel && !details.accountingLabel) {
    return NextResponse.json(
      { message: "次回以降も使う場合は、整理用科目を入力してください。" },
      { status: 400 },
    );
  }
  const history = await prisma.$transaction(async (transaction) => {
    const created = await transaction.paymentHistory.create({
      data: {
        ...details,
        subscriptionId: subscription.id,
        userId: user.id,
        businessUsePercent: subscription.businessUsePercent,
        subscriptionNameSnapshot: subscription.name,
        categoryNameSnapshot: subscription.category?.name ?? null,
        paymentMethodNameSnapshot: subscription.paymentMethod?.name ?? null,
      },
    });
    if (parsed.data.rememberAccountingLabel) {
      await transaction.subscription.update({
        where: { id: subscription.id },
        data: { defaultAccountingLabel: details.accountingLabel },
      });
    }
    return created;
  });

  return NextResponse.json({ id: history.id });
}
