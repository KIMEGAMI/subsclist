import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { MAX_PAYMENT_HISTORY_MEMO_LENGTH } from "@/lib/app-constants";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  subscriptionId: z.string().min(1),
  amount: z.coerce.number().int().min(0),
  paidAt: z.string().min(1),
  memo: z.string().max(MAX_PAYMENT_HISTORY_MEMO_LENGTH).optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "ログインしてください。" }, { status: 401 });
  if (!user.emailVerified) return NextResponse.json({ message: "メール認証が必要です。" }, { status: 403 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "入力内容を確認してください。" }, { status: 400 });

  const subscription = await prisma.subscription.findFirst({
    where: { id: parsed.data.subscriptionId, userId: user.id, deletedAt: null },
    select: { id: true },
  });
  if (!subscription) return NextResponse.json({ message: "対象のサブスクが見つかりません。" }, { status: 404 });

  const history = await prisma.paymentHistory.create({
    data: {
      subscriptionId: subscription.id,
      userId: user.id,
      amount: parsed.data.amount,
      paidAt: new Date(parsed.data.paidAt),
      memo: parsed.data.memo || null,
    },
  });

  return NextResponse.json({ id: history.id });
}
