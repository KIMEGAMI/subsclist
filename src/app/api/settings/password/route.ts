import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/app-constants";
import { setSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";

const schema = z.object({
  currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
  newPasswordConfirm: z
    .string()
    .min(MIN_PASSWORD_LENGTH)
    .max(MAX_PASSWORD_LENGTH),
});

export async function PUT(request: Request) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const sessionUser = access.user;
  const parsed = schema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      {
        message:
          "現在のパスワード、新しいパスワード、確認用パスワードを入力してください。",
      },
      { status: 400 },
    );
  }

  if (parsed.data.newPassword !== parsed.data.newPasswordConfirm) {
    return NextResponse.json(
      { message: "新しいパスワードと確認用パスワードが一致しません。" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) {
    return NextResponse.json(
      { message: "ユーザーが見つかりません。" },
      { status: 404 },
    );
  }

  const valid = await bcrypt.compare(
    parsed.data.currentPassword,
    user.passwordHash,
  );
  if (!valid) {
    return NextResponse.json(
      { message: "現在のパスワードが正しくありません。" },
      { status: 400 },
    );
  }

  const samePassword = await bcrypt.compare(
    parsed.data.newPassword,
    user.passwordHash,
  );
  if (samePassword) {
    return NextResponse.json(
      { message: "現在とは異なるパスワードを設定してください。" },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  const updatedUser = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
        failedLoginCount: 0,
        lastFailedLoginAt: null,
        lockedUntil: null,
      },
      select: { id: true, emailVerified: true },
    });
    await transaction.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return updated;
  });
  await setSession(updatedUser.id, Boolean(updatedUser.emailVerified));

  return NextResponse.json({ ok: true });
}
