import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { clearSession, createVerificationToken, hashToken } from "@/lib/auth";
import { EMAIL_VERIFICATION_TOKEN_TTL_MS, MAX_AUTH_REQUEST_BODY_BYTES, MAX_EMAIL_LENGTH, MAX_USER_NAME_LENGTH } from "@/lib/app-constants";
import { authMailKeys, authMailRateLimit, recordAuthMailAttempt } from "@/lib/auth-mail-rate-limit";
import { assertAuthSecret, assertMailEnv, env, isProtectedAccountEmail } from "@/lib/env";
import { userErrorMessage } from "@/lib/error-messages";
import { sendVerificationEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { requestClientIdentifier } from "@/lib/request-client";
import { readJsonBodyWithLimit } from "@/lib/request-body";

const schema = z.object({
  name: z.string().trim().min(1).max(MAX_USER_NAME_LENGTH),
  email: z.string().trim().email().max(MAX_EMAIL_LENGTH),
  termsAccepted: z.literal(true),
  privacyAccepted: z.literal(true),
});

const initialCategories = [
  ["動画", "#4f46e5"],
  ["音楽", "#ec4899"],
  ["仕事", "#0ea5e9"],
  ["学習", "#22c55e"],
  ["クラウド", "#f59e0b"],
] as const;

async function createTokenAndSend(userId: string, email: string) {
  const token = createVerificationToken();
  const tokenHash = hashToken(token);
  const now = new Date();
  await prisma.$transaction([
    prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS),
      },
    }),
  ]);
  try {
    await sendVerificationEmail(email, token);
  } catch (error) {
    await prisma.emailVerificationToken.updateMany({
      where: { userId, tokenHash, usedAt: null },
      data: { usedAt: new Date() },
    });
    throw error;
  }
}

const registrationAcceptedMessage = "登録リクエストを受け付けました。未認証のアカウントの場合は認証メールを送信します。届かない場合は同じメールアドレスで再度登録してください。既にご利用中の場合はログインしてください。";

async function acceptedResponse() {
  await clearSession();
  return NextResponse.json({ ok: true, message: registrationAcceptedMessage }, { status: 202 });
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function rateLimitedResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { message: `認証メールの送信回数が多すぎます。約${Math.ceil(retryAfterSeconds / 60)}分後に、もう一度お試しください。` },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

export async function POST(request: Request) {
  try {
    assertAuthSecret();
    assertMailEnv();
  } catch (error) {
    return NextResponse.json({ message: userErrorMessage(error, "メール送信設定を確認してください。") }, { status: 500 });
  }

  const body = await readJsonBodyWithLimit(request, MAX_AUTH_REQUEST_BODY_BYTES);
  if (!body.ok && body.reason === "too_large") {
    return NextResponse.json({ message: "リクエストが大きすぎます。入力内容を確認してください。" }, { status: 413 });
  }
  if (!body.ok) {
    return NextResponse.json({ message: "入力内容を確認してください。" }, { status: 400 });
  }

  const parsed = schema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json({ message: "入力内容、利用規約、プライバシーポリシーへの同意を確認してください。" }, { status: 400 });
  }

  const { name } = parsed.data;
  const email = parsed.data.email.toLowerCase();
  const keys = authMailKeys(email, requestClientIdentifier(request), env.authSecret);
  const rateLimit = authMailRateLimit(keys);
  if (rateLimit.limited) return rateLimitedResponse(rateLimit.retryAfterSeconds);
  recordAuthMailAttempt(keys);

  const passwordHash = await bcrypt.hash(createVerificationToken(), 12);
  const exists = await prisma.user.findUnique({ where: { email } });
  if (isProtectedAccountEmail(email) || exists?.emailVerified) return acceptedResponse();

  if (exists) {
    try {
      await createTokenAndSend(exists.id, exists.email);
    } catch {
      console.error("Failed to resend verification email during registration.");
    }
    return acceptedResponse();
  }

  let user: { id: string };
  try {
    user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        categories: {
          create: initialCategories.map(([categoryName, color]) => ({
            name: categoryName,
            color,
          })),
        },
      },
      select: { id: true },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return acceptedResponse();
    throw error;
  }

  try {
    await createTokenAndSend(user.id, email);
  } catch {
    console.error("Failed to send verification email after registration.");
  }
  return acceptedResponse();
}
