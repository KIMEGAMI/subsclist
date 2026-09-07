import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { clearSession, hashToken } from "@/lib/auth";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/app-constants";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";

const schema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
  newPasswordConfirm: z
    .string()
    .min(MIN_PASSWORD_LENGTH)
    .max(MAX_PASSWORD_LENGTH),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "再設定URLまたはパスワードの入力内容を確認してください。" },
      { status: 400 },
    );
  }

  if (parsed.data.newPassword !== parsed.data.newPasswordConfirm) {
    return NextResponse.json(
      { message: "新しいパスワードと確認用パスワードが一致しません。" },
      { status: 400 },
    );
  }

  const record = await prisma.passwordResetToken.findFirst({
    where: { tokenHash: hashToken(parsed.data.token) },
    include: { user: { select: { id: true, passwordHash: true } } },
  });

  const now = new Date();
  if (!record || record.usedAt || record.expiresAt <= now) {
    return NextResponse.json(
      {
        message:
          "パスワード再設定URLが無効、または有効期限切れです。もう一度やり直してください。",
      },
      { status: 400 },
    );
  }

  const samePassword = await bcrypt.compare(
    parsed.data.newPassword,
    record.user.passwordHash,
  );
  if (samePassword) {
    return NextResponse.json(
      { message: "現在とは異なるパスワードを設定してください。" },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  const changed = await prisma.$transaction(async (transaction) => {
    const claimed = await transaction.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return false;

    await transaction.user.update({
      where: { id: record.user.id },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
        failedLoginCount: 0,
        lastFailedLoginAt: null,
        lockedUntil: null,
      },
    });
    await transaction.passwordResetToken.updateMany({
      where: { userId: record.user.id, usedAt: null },
      data: { usedAt: now },
    });
    return true;
  });
  if (!changed) {
    return NextResponse.json(
      {
        message:
          "パスワード再設定URLが無効、または既に使用されています。もう一度やり直してください。",
      },
      { status: 400 },
    );
  }

  await clearSession();

  return NextResponse.json({
    ok: true,
    message:
      "パスワードを再設定しました。新しいパスワードでログインしてください。",
  });
}
