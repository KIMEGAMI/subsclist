import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import {
  MAX_PAYMENT_METHOD_MEMO_LENGTH,
  MAX_PAYMENT_METHOD_NAME_LENGTH,
} from "@/lib/app-constants";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";
import { stripePaymentMethodTypes } from "@/lib/stripe-payment-methods";

const schema = z.object({
  name: z.string().trim().min(1).max(MAX_PAYMENT_METHOD_NAME_LENGTH),
  type: z.enum(stripePaymentMethodTypes),
  memo: z.string().trim().max(MAX_PAYMENT_METHOD_MEMO_LENGTH).optional(),
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
  await prisma.paymentMethod.create({
    data: { userId: user.id, ...parsed.data, memo: parsed.data.memo || null },
  });
  return NextResponse.json({ ok: true });
}
