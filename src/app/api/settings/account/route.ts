import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { clearSession, requireVerifiedUser } from "@/lib/auth";
import { isProtectedAccountEmail } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  currentPassword: z.string().min(1),
  confirmText: z.literal("削除する"),
  email: z.string().email(),
});

export async function DELETE(request: Request) {
  const sessionUser = await requireVerifiedUser();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "アカウント削除の確認情報が正しくありません。" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!user) {
    return NextResponse.json({ message: "ユーザーが見つかりませんでした。" }, { status: 404 });
  }

  if (user.email !== parsed.data.email) {
    return NextResponse.json({ message: "削除対象のアカウントが一致しません。" }, { status: 400 });
  }

  if (isProtectedAccountEmail(user.email)) {
    return NextResponse.json({ message: "このアカウントは削除できません。" }, { status: 403 });
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ message: "現在のパスワードが正しくありません。" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.notificationDelivery.deleteMany({ where: { userId: user.id } }),
    prisma.notificationSetting.deleteMany({ where: { userId: user.id } }),
    prisma.paymentHistory.deleteMany({ where: { userId: user.id } }),
    prisma.cancellationChecklistItem.deleteMany({ where: { userId: user.id } }),
    prisma.cancellationEvidence.deleteMany({ where: { userId: user.id } }),
    prisma.subscription.deleteMany({ where: { userId: user.id } }),
    prisma.paymentMethod.deleteMany({ where: { userId: user.id } }),
    prisma.category.deleteMany({ where: { userId: user.id } }),
    prisma.userPreference.deleteMany({ where: { userId: user.id } }),
    prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } }),
    prisma.user.delete({ where: { id: user.id } }),
  ]);

  await clearSession();
  return NextResponse.json({ ok: true });
}
