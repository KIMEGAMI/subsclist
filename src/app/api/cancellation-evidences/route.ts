import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { ALLOWED_URL_PROTOCOLS, MAX_MEMO_LENGTH, MAX_SUBSCRIPTION_NAME_LENGTH } from "@/lib/app-constants";
import { prisma } from "@/lib/prisma";
import { isPremiumPlan } from "@/lib/plans";

const schema = z.object({
  subscriptionId: z.string().min(1),
  title: z.string().trim().min(1).max(MAX_SUBSCRIPTION_NAME_LENGTH),
  kind: z.enum(["REQUEST", "RECEIPT", "EMAIL", "SCREENSHOT", "MEMO"]),
  referenceUrl: z.string().optional(),
  memo: z.string().max(MAX_MEMO_LENGTH).optional(),
  recordedAt: z.string().optional(),
});

function optionalUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (ALLOWED_URL_PROTOCOLS as readonly string[]).includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "ログインしてください。" }, { status: 401 });
  if (!user.emailVerified) return NextResponse.json({ message: "メール認証が必要です。" }, { status: 403 });
  if (!isPremiumPlan(user.plan)) return NextResponse.json({ message: "解約支援はPremium限定です。" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ message: "入力内容を確認してください。" }, { status: 400 });

  const subscription = await prisma.subscription.findFirst({
    where: { id: parsed.data.subscriptionId, userId: user.id, deletedAt: null },
  });
  if (!subscription) return NextResponse.json({ message: "対象が見つかりません。" }, { status: 404 });

  await prisma.cancellationEvidence.create({
    data: {
      userId: user.id,
      subscriptionId: subscription.id,
      title: parsed.data.title,
      kind: parsed.data.kind,
      referenceUrl: optionalUrl(parsed.data.referenceUrl),
      memo: parsed.data.memo || null,
      recordedAt: parsed.data.recordedAt ? new Date(parsed.data.recordedAt) : new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
