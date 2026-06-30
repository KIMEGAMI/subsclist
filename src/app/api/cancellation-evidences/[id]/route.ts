import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPremiumPlan } from "@/lib/plans";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "ログインしてください。" }, { status: 401 });
  if (!user.emailVerified) return NextResponse.json({ message: "メール認証が必要です。" }, { status: 403 });
  if (!isPremiumPlan(user.plan)) return NextResponse.json({ message: "解約支援はPremium限定です。" }, { status: 403 });

  const { id } = await params;
  const evidence = await prisma.cancellationEvidence.findFirst({ where: { id, userId: user.id } });
  if (!evidence) return NextResponse.json({ message: "対象が見つかりません。" }, { status: 404 });

  await prisma.cancellationEvidence.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
