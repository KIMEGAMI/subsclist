import { NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { isPremiumPlan } from "@/lib/plans";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  if (!isPremiumPlan(user.plan)) return NextResponse.json({ message: "解約支援はPremium限定です。" }, { status: 403 });

  const { id } = await params;
  const result = await prisma.cancellationEvidence.deleteMany({ where: { id, userId: user.id } });
  if (result.count === 0) return NextResponse.json({ message: "対象が見つかりません。" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
