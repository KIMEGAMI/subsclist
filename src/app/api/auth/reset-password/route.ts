import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { clearSession, hashToken } from "@/lib/auth";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/app-constants";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
  newPasswordConfirm: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "入力内容を確認してください。" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "再設定URLまたはパスワードの入力内容を確認してください。" }, { status: 400 });
  }

  if (parsed.data.newPassword !== parsed.data.newPasswordConfirm) {
    return NextResponse.json({ message: "新しいパスワードと確認用パスワードが一致しません。" }, { status: 400 });
  }

  const record = await prisma.passwordResetToken.findFirst({
    where: { tokenHash: hashToken(parsed.data.token) },
    include: { user: { select: { id: true, passwordHash: true } } },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json({ message: "パスワード再設定URLが無効、または有効期限切れです。もう一度やり直してください。" }, { status: 400 });
  }

  const samePassword = await bcrypt.compare(parsed.data.newPassword, record.user.passwordHash);
  if (samePassword) {
    return NextResponse.json({ message: "現在とは異なるパスワードを設定してください。" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.user.id },
      data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12) },
    }),
    prisma.passwordResetToken.updateMany({
      where: { userId: record.user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);
  await clearSession();

  return NextResponse.json({ ok: true, message: "パスワードを再設定しました。新しいパスワードでログインしてください。" });
}
