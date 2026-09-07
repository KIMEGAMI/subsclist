import { NextResponse } from "next/server";
import { createVerificationToken, getCurrentUser, hashToken } from "@/lib/auth";
import { EMAIL_VERIFICATION_TOKEN_TTL_MS } from "@/lib/app-constants";
import { authMailKeys, authMailRateLimit, recordAuthMailAttempt, releaseAuthMailAttempt } from "@/lib/auth-mail-rate-limit";
import { assertAuthSecret, assertMailEnv, env } from "@/lib/env";
import { userErrorMessage } from "@/lib/error-messages";
import { sendVerificationEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { requestClientIdentifier } from "@/lib/request-client";

export async function POST(request: Request) {
  try {
    assertAuthSecret();
    assertMailEnv();
  } catch (error) {
    return NextResponse.json({ message: userErrorMessage(error, "メール送信設定を確認してください。") }, { status: 500 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "ログインしてください。" }, { status: 401 });
  }
  if (user.emailVerified) {
    return NextResponse.json({ ok: true, message: "このアカウントは既にメール認証済みです。" });
  }

  const keys = authMailKeys(user.email, requestClientIdentifier(request), env.authSecret);
  const rateLimit = authMailRateLimit(keys);
  if (rateLimit.limited) {
    return NextResponse.json(
      { message: `認証メールの送信回数が多すぎます。約${Math.ceil(rateLimit.retryAfterSeconds / 60)}分後に、もう一度お試しください。` },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const attemptedAt = Date.now();
  recordAuthMailAttempt(keys, attemptedAt);
  let createdTokenHash: string | null = null;
  try {
    const token = createVerificationToken();
    createdTokenHash = hashToken(token);
    const now = new Date();
    await prisma.$transaction([
      prisma.emailVerificationToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      }),
      prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash: createdTokenHash,
          expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS),
        },
      }),
    ]);
    await sendVerificationEmail(user.email, token);
  } catch {
    releaseAuthMailAttempt(keys, attemptedAt);
    if (createdTokenHash) {
      await prisma.emailVerificationToken.updateMany({
        where: { userId: user.id, tokenHash: createdTokenHash, usedAt: null },
        data: { usedAt: new Date() },
      }).catch(() => undefined);
    }
    console.error("Failed to send verification email from resend endpoint.");
    return NextResponse.json({ message: "認証メールを送信できませんでした。Google SMTPの設定を確認してください。" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, message: "認証メールを再送しました。" });
}
