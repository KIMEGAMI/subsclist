import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { createVerificationToken, hashToken } from "@/lib/auth";
import { MAX_EMAIL_LENGTH, PASSWORD_RESET_TOKEN_TTL_MS } from "@/lib/app-constants";
import { assertMailEnv } from "@/lib/env";
import { userErrorMessage } from "@/lib/error-messages";
import { sendPasswordResetEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  email: z.string().trim().email().max(MAX_EMAIL_LENGTH),
});

const successMessage = "入力されたメールアドレス宛に、パスワード再設定URLを送信しました。";

export async function POST(request: Request) {
  try {
    try {
      assertMailEnv();
    } catch (error) {
      return NextResponse.json({ message: userErrorMessage(error, "メール送信設定を確認してください。") }, { status: 500 });
    }

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "メールアドレスの形式を確認してください。" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ ok: true, message: successMessage });
    }

    const token = createVerificationToken();
    const now = new Date();
    await prisma.$transaction([
      prisma.$executeRaw`UPDATE PasswordResetToken SET usedAt = ${now} WHERE userId = ${user.id} AND usedAt IS NULL`,
      prisma.$executeRaw`
        INSERT INTO PasswordResetToken (id, userId, tokenHash, expiresAt, createdAt)
        VALUES (${crypto.randomUUID()}, ${user.id}, ${hashToken(token)}, ${new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS)}, ${now})
      `,
    ]);

    await sendPasswordResetEmail(user.email, token);

    return NextResponse.json({ ok: true, message: successMessage });
  } catch (error) {
    console.error("Failed to handle password reset request.", error);
    return NextResponse.json({ message: "パスワード再設定メールを送信できませんでした。開発サーバーを再起動してから、もう一度お試しください。" }, { status: 500 });
  }
}
