import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { MAX_PAYMENT_METHOD_NAME_LENGTH } from "@/lib/app-constants";
import { prisma } from "@/lib/prisma";
import { stripePaymentMethodTypes } from "@/lib/stripe-payment-methods";

const schema = z.object({
  name: z.string().trim().min(1).max(MAX_PAYMENT_METHOD_NAME_LENGTH),
  type: z.enum(stripePaymentMethodTypes),
  memo: z.string().optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "ログインしてください。" }, { status: 401 });
  if (!user.emailVerified) return NextResponse.json({ message: "メール認証が必要です。" }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "入力内容を確認してください。" }, { status: 400 });
  await prisma.paymentMethod.create({ data: { userId: user.id, ...parsed.data, memo: parsed.data.memo || null } });
  return NextResponse.json({ ok: true });
}
