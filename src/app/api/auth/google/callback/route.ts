import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail, setSession } from "@/lib/auth";
import { MAX_EMAIL_LENGTH, MAX_USER_NAME_LENGTH } from "@/lib/app-constants";
import { assertGoogleEnv, env, isProtectedAccountEmail } from "@/lib/env";
import {
  GOOGLE_OAUTH_CALLBACK_PATH,
  GOOGLE_OAUTH_FETCH_TIMEOUT_MS,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_VERIFIER_COOKIE,
  secureOAuthValueEqual,
} from "@/lib/google-oauth";
import { prisma } from "@/lib/prisma";
import { recordSuccessfulLogin } from "@/lib/login-security";
import { sendNewDeviceLoginEmail } from "@/lib/mail";

const initialCategories = [
  ["動画", "#4f46e5"],
  ["音楽", "#ec4899"],
  ["仕事", "#0ea5e9"],
  ["学習", "#22c55e"],
  ["クラウド", "#f59e0b"],
] as const;

const googleTokenSchema = z.object({ access_token: z.string().min(1) });
const googleProfileSchema = z.object({
  sub: z.string().min(1).max(255),
  email: z.string().trim().email().max(MAX_EMAIL_LENGTH),
  email_verified: z.literal(true),
  name: z.string().trim().min(1).max(MAX_USER_NAME_LENGTH).optional(),
});
type GoogleProfile = z.infer<typeof googleProfileSchema>;

function redirectToLogin(status: string) {
  const url = new URL("/login", env.appUrl);
  url.searchParams.set("google", status);
  return NextResponse.redirect(url);
}

async function fetchGoogleProfile(
  code: string,
  codeVerifier: string,
): Promise<GoogleProfile> {
  const redirectUri = new URL(
    GOOGLE_OAUTH_CALLBACK_PATH,
    env.appUrl,
  ).toString();
  const body = new URLSearchParams({
    code,
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(GOOGLE_OAUTH_FETCH_TIMEOUT_MS),
  });
  const tokenData = googleTokenSchema.safeParse(await tokenResponse.json());
  if (!tokenResponse.ok || !tokenData.success) {
    throw new Error("Google認証トークンの取得に失敗しました。");
  }

  const profileResponse = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${tokenData.data.access_token}` },
      signal: AbortSignal.timeout(GOOGLE_OAUTH_FETCH_TIMEOUT_MS),
    },
  );
  const profile = googleProfileSchema.safeParse(await profileResponse.json());
  if (!profileResponse.ok || !profile.success) {
    throw new Error(
      "Googleアカウントの検証済みプロフィールを取得できませんでした。",
    );
  }
  return profile.data;
}

export async function GET(request: NextRequest) {
  try {
    assertGoogleEnv();
  } catch {
    return redirectToLogin("config");
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const savedState = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const codeVerifier = cookieStore.get(GOOGLE_OAUTH_VERIFIER_COOKIE)?.value;
  const expiredCookie = { path: GOOGLE_OAUTH_CALLBACK_PATH, maxAge: 0 };
  cookieStore.set(GOOGLE_OAUTH_STATE_COOKIE, "", expiredCookie);
  cookieStore.set(GOOGLE_OAUTH_VERIFIER_COOKIE, "", expiredCookie);

  if (!code || !codeVerifier || !secureOAuthValueEqual(state, savedState)) {
    return redirectToLogin("invalid");
  }

  try {
    const profile = await fetchGoogleProfile(code, codeVerifier);
    const email = profile.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });

    if (!existing && isProtectedAccountEmail(email)) {
      return redirectToLogin("failed");
    }

    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            emailVerified: existing.emailVerified ?? new Date(),
            name: existing.name ?? profile.name ?? null,
          },
        })
      : await prisma.user.create({
          data: {
            name: profile.name ?? email.split("@")[0],
            email,
            emailVerified: new Date(),
            passwordHash: await bcrypt.hash(
              `google:${profile.sub}:${crypto.randomUUID()}`,
              12,
            ),
            categories: {
              create: initialCategories.map(([name, color]) => ({
                name,
                color,
              })),
            },
          },
        });

    const loginSecurity = await recordSuccessfulLogin(user.id, request);
    await setSession(user.id, true);
    if (loginSecurity.newDevice && user.email.toLowerCase() !== env.demoUserEmail.toLowerCase()) {
      try {
        await sendNewDeviceLoginEmail({
          email: user.email,
          clientLabel: loginSecurity.clientLabel,
          occurredAt: loginSecurity.occurredAt,
        });
      } catch {
        console.error("New device Google login email failed.");
      }
    }
    return NextResponse.redirect(
      new URL(isAdminEmail(user.email) ? "/admin" : "/dashboard", env.appUrl),
    );
  } catch {
    console.error("Google login failed.");
    return redirectToLogin("failed");
  }
}
