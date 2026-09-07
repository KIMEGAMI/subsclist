import { NextResponse } from "next/server";
import { z } from "zod";
import { createVerificationToken, hashToken } from "@/lib/auth";
import { MAX_EMAIL_LENGTH, PASSWORD_RESET_TOKEN_TTL_MS } from "@/lib/app-constants";
import { authMailKeys, authMailRateLimit, recordAuthMailAttempt, releaseAuthMailAttempt } from "@/lib/auth-mail-rate-limit";
import { assertAuthSecret, assertMailEnv, env } from "@/lib/env";
import { userErrorMessage } from "@/lib/error-messages";
import { sendPasswordResetEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { requestClientIdentifier } from "@/lib/request-client";

const schema = z.object({
  email: z.string().trim().email().max(MAX_EMAIL_LENGTH),
});

const successMessage = "入力されたメールアドレス宛に、パスワード再設定URLを送信しました。";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "入力内容を確認してください。" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "メールアドレスの形式を確認してください。" }, { status: 400 });
  }

  try {
    assertAuthSecret();
    assertMailEnv();
  } catch (error) {
    return NextResponse.json({ message: userErrorMessage(error, "メール送信設定を確認してください。") }, { status: 500 });
  }

  try {
    const email = parsed.data.email.toLowerCase();
    const keys = authMailKeys(email, requestClientIdentifier(request), env.authSecret);
    const rateLimit = authMailRateLimit(keys);
    if (rateLimit.limited) {
      return NextResponse.json({ ok: true, message: successMessage });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ ok: true, message: successMessage });
    }

    const attemptedAt = Date.now();
    recordAuthMailAttempt(keys, attemptedAt);
    let createdTokenHash: string | null = null;
    try {
      const token = createVerificationToken();
      createdTokenHash = hashToken(token);
      const now = new Date();
      await prisma.$transaction([
        prisma.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: now },
        }),
        prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: createdTokenHash,
            expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
          },
        }),
      ]);
      await sendPasswordResetEmail(user.email, token);
    } catch (error) {
      if (createdTokenHash) {
        await prisma.passwordResetToken.updateMany({
          where: { userId: user.id, tokenHash: createdTokenHash, usedAt: null },
          data: { usedAt: new Date() },
        }).catch(() => undefined);
      }
      releaseAuthMailAttempt(keys, attemptedAt);
      throw error;
    }

    return NextResponse.json({ ok: true, message: successMessage });
  } catch {
    console.error("Failed to handle password reset request.");
    return NextResponse.json({ message: "パスワード再設定メールを送信できませんでした。時間をおいて、もう一度お試しください。" }, { status: 500 });
  }
}
