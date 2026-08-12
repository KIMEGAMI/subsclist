import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail, setSession } from "@/lib/auth";
import { authAttemptKey, clearFailedAuthAttempts, isAuthRateLimited, recordFailedAuthAttempt } from "@/lib/auth-rate-limit";
import { AUTH_RATE_LIMIT_WINDOW_MINUTES } from "@/lib/app-constants";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const invalidCredentialsMessage = "ログイン情報が正しくありません。";

function clientIdentifier(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

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
  const attemptKey = authAttemptKey(email, clientIdentifier(request), env.authSecret);
  if (isAuthRateLimited(attemptKey)) {
    return NextResponse.json({ message: `ログイン試行回数が多すぎます。${AUTH_RATE_LIMIT_WINDOW_MINUTES}分ほど時間をおいて、もう一度お試しください。` }, { status: 429 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    recordFailedAuthAttempt(attemptKey);
    return NextResponse.json({ message: invalidCredentialsMessage }, { status: 401 });
  }

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    recordFailedAuthAttempt(attemptKey);
    return NextResponse.json({ message: invalidCredentialsMessage }, { status: 401 });
  }

  clearFailedAuthAttempts(attemptKey);
  await setSession(user.id, Boolean(user.emailVerified));

  return NextResponse.json({
    ok: true,
    emailVerified: Boolean(user.emailVerified),
    redirectTo: isAdminEmail(user.email) ? "/admin" : Boolean(user.emailVerified) ? "/dashboard" : "/verify-email",
  });
}
