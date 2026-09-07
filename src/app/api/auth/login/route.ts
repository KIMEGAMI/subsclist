import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail, setSession } from "@/lib/auth";
import { authAttemptKey, clearFailedAuthAttempts, isAuthRateLimited, recordFailedAuthAttempt } from "@/lib/auth-rate-limit";
import { AUTH_RATE_LIMIT_WINDOW_MINUTES, LOGIN_ACCOUNT_LOCK_MINUTES } from "@/lib/app-constants";
import { env } from "@/lib/env";
import { isAccountLoginLocked } from "@/lib/login-security-policy";
import { recordFailedLogin, recordSuccessfulLogin } from "@/lib/login-security";
import { sendAccountLockedEmail, sendNewDeviceLoginEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { requestClientIdentifier } from "@/lib/request-client";

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const invalidCredentialsMessage = "ログイン情報が正しくありません。";
const lockedMessage = `安全のためログインを一時的に制限しています。${LOGIN_ACCOUNT_LOCK_MINUTES}分ほど時間をおくか、パスワードを再設定してください。`;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "入力内容を確認してください。" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "メールアドレスとパスワードを入力してください。" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const attemptKey = authAttemptKey(email, requestClientIdentifier(request), env.authSecret);
  if (isAuthRateLimited(attemptKey)) {
    return NextResponse.json({ message: `ログイン試行回数が多すぎます。${AUTH_RATE_LIMIT_WINDOW_MINUTES}分ほど時間をおいて、もう一度お試しください。` }, { status: 429 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    recordFailedAuthAttempt(attemptKey);
    return NextResponse.json({ message: invalidCredentialsMessage }, { status: 401 });
  }

  if (isAccountLoginLocked(user.lockedUntil)) {
    return NextResponse.json({ message: lockedMessage }, { status: 429 });
  }

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    recordFailedAuthAttempt(attemptKey);
    const failure = await recordFailedLogin(user.id);
    if (failure.newlyLocked && failure.lockedUntil) {
      try {
        await sendAccountLockedEmail({ email: user.email, lockedUntil: failure.lockedUntil });
      } catch {
        console.error("Account lock security email failed.");
      }
    }
    return NextResponse.json({ message: invalidCredentialsMessage }, { status: 401 });
  }

  clearFailedAuthAttempts(attemptKey);
  const loginSecurity = await recordSuccessfulLogin(user.id, request);
  await setSession(user.id, Boolean(user.emailVerified));
  if (loginSecurity.newDevice && user.email.toLowerCase() !== env.demoUserEmail.toLowerCase()) {
    try {
      await sendNewDeviceLoginEmail({
        email: user.email,
        clientLabel: loginSecurity.clientLabel,
        occurredAt: loginSecurity.occurredAt,
      });
    } catch {
      console.error("New device login email failed.");
    }
  }

  return NextResponse.json({
    ok: true,
    emailVerified: Boolean(user.emailVerified),
    redirectTo: isAdminEmail(user.email) ? "/admin" : Boolean(user.emailVerified) ? "/dashboard" : "/verify-email",
  });
}
