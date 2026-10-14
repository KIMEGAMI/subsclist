import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { MAX_CANCELLATION_CHECKLIST_REQUEST_BODY_BYTES } from "@/lib/app-constants";
import { prisma } from "@/lib/prisma";
import { isPremiumPlan } from "@/lib/plans";
import { readJsonBodyWithLimit } from "@/lib/request-body";

const schema = z.object({
  completed: z.boolean(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  if (!isPremiumPlan(user.plan)) return NextResponse.json({ message: "解約支援はPremium限定です。" }, { status: 403 });

  const { id } = await params;
  const body = await readJsonBodyWithLimit(
    request,
    MAX_CANCELLATION_CHECKLIST_REQUEST_BODY_BYTES,
  );
  if (!body.ok) {
    return NextResponse.json(
      { message: body.reason === "too_large" ? "送信データが大きすぎます。" : "入力内容を確認してください。" },
      { status: body.reason === "too_large" ? 413 : 400 },
    );
  }
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ message: "入力内容を確認してください。" }, { status: 400 });

  const result = await prisma.cancellationChecklistItem.updateMany({
    where: { id, userId: user.id },
    data: { completedAt: parsed.data.completed ? new Date() : null },
  });
  if (result.count === 0) return NextResponse.json({ message: "対象が見つかりません。" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
