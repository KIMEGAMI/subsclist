import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findTokenRecord, setSession } from "@/lib/auth";
import {
  MAX_AUTH_REQUEST_BODY_BYTES,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  ONE_TIME_TOKEN_MAX_LENGTH,
} from "@/lib/app-constants";
import { env } from "@/lib/env";
import { authTokenLookupKey, claimAuthTokenLookup } from "@/lib/auth-token-rate-limit";
import { prisma } from "@/lib/prisma";
import { readJsonBodyWithLimit } from "@/lib/request-body";
import { requestClientIdentifier } from "@/lib/request-client";

const schema = z.object({
  token: z.string().min(20).max(ONE_TIME_TOKEN_MAX_LENGTH),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
  newPasswordConfirm: z
    .string()
    .min(MIN_PASSWORD_LENGTH)
    .max(MAX_PASSWORD_LENGTH),
});

function verifyEmailUrl(request: NextRequest, status: "invalid" | "error") {
  return new URL(`/verify-email?status=${status}`, request.url);
}

function redirectWithoutTokenCaching(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return redirectWithoutTokenCaching(verifyEmailUrl(request, "invalid"));

  const url = new URL("/verify-email", request.url);
  url.searchParams.set("token", token);
  return redirectWithoutTokenCaching(url);
}

export async function POST(request: Request) {
  const body = await readJsonBodyWithLimit(request, MAX_AUTH_REQUEST_BODY_BYTES);
  if (!body.ok) {
    const tooLarge = body.reason === "too_large";
    return NextResponse.json(
      { message: tooLarge ? "リクエストが大きすぎます。" : "入力内容を確認してください。" },
      { status: tooLarge ? 413 : 400 },
    );
  }

  const parsed = schema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "認証リンクとパスワードの入力内容を確認してください。" },
      { status: 400 },
    );
  }
  if (parsed.data.newPassword !== parsed.data.newPasswordConfirm) {
    return NextResponse.json(
      { message: "パスワードと確認用パスワードが一致しません。" },
      { status: 400 },
    );
  }

  const lookupKey = authTokenLookupKey(requestClientIdentifier(request), env.authSecret);
  try {
    const record = await findTokenRecord(
      parsed.data.token,
      (tokenHash) =>
        prisma.emailVerificationToken.findUnique({
          where: { tokenHash },
          select: { id: true, userId: true, usedAt: true, expiresAt: true },
        }),
      () => claimAuthTokenLookup(lookupKey),
    );
    const now = new Date();
    if (!record || record.usedAt || record.expiresAt <= now) {
      return NextResponse.json(
        { message: "認証リンクが無効、または有効期限切れです。" },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    const verified = await prisma.$transaction(async (transaction) => {
      const claimed = await transaction.emailVerificationToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return false;

      const updated = await transaction.user.updateMany({
        where: { id: record.userId, emailVerified: null },
        data: {
          passwordHash,
          emailVerified: now,
          sessionVersion: { increment: 1 },
          failedLoginCount: 0,
          lastFailedLoginAt: null,
          lockedUntil: null,
        },
      });
      if (updated.count !== 1) return false;

      await transaction.emailVerificationToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: now },
      });
      return true;
    });

    if (!verified) {
      return NextResponse.json(
        { message: "認証リンクが無効、または既に使用されています。" },
        { status: 400 },
      );
    }

    await setSession(record.userId, true);
    return NextResponse.json({ ok: true, redirectTo: "/dashboard" });
  } catch {
    console.error("Failed to verify email token.");
    return NextResponse.json(
      { message: "メール認証に失敗しました。時間をおいて再度お試しください。" },
      { status: 500 },
    );
  }
}
