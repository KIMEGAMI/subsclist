import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPremiumPlan } from "@/lib/plans";

const schema = z.object({
  completed: z.boolean(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "ログインしてください。" }, { status: 401 });
  if (!user.emailVerified) return NextResponse.json({ message: "メール認証が必要です。" }, { status: 403 });
  if (!isPremiumPlan(user.plan)) return NextResponse.json({ message: "解約支援はPremium限定です。" }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ message: "入力内容を確認してください。" }, { status: 400 });

  const item = await prisma.cancellationChecklistItem.findFirst({ where: { id, userId: user.id } });
  if (!item) return NextResponse.json({ message: "対象が見つかりません。" }, { status: 404 });

  await prisma.cancellationChecklistItem.update({
    where: { id },
    data: { completedAt: parsed.data.completed ? new Date() : null },
  });

  return NextResponse.json({ ok: true });
}
