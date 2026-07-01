import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { setSession } from "@/lib/auth";
import { assertGoogleEnv, env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const stateCookie = "subsclist_google_oauth_state";

const initialCategories = [
  ["\u52d5\u753b", "#4f46e5"],
  ["\u97f3\u697d", "#ec4899"],
  ["\u4ed5\u4e8b", "#0ea5e9"],
  ["\u5b66\u7fd2", "#22c55e"],
  ["\u30af\u30e9\u30a6\u30c9", "#f59e0b"],
] as const;

type GoogleTokenResponse = {
  access_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleProfile = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

function redirectToLogin(status: string) {
  const url = new URL("/login", env.appUrl);
  url.searchParams.set("google", status);
  return NextResponse.redirect(url);
}

function decodeJwtPayload(token: string): GoogleProfile | null {
  const [, payload] = token.split(".");
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as GoogleProfile;
  } catch {
    return null;
  }
}

async function fetchGoogleProfile(code: string): Promise<GoogleProfile & { email: string }> {
  const redirectUri = new URL("/api/auth/google/callback", env.appUrl).toString();
  const body = new URLSearchParams({
    code,
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;
  if (!tokenResponse.ok || !tokenData.id_token) {
    throw new Error(tokenData.error_description ?? tokenData.error ?? "Google token request failed.");
  }

  const profile = decodeJwtPayload(tokenData.id_token);
  if (!profile?.email || !profile.email_verified) {
    throw new Error("Google account email is not verified.");
  }
  return profile as GoogleProfile & { email: string };
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
  const savedState = cookieStore.get(stateCookie)?.value;
  cookieStore.delete(stateCookie);

  if (!code || !state || !savedState || state !== savedState) {
    return redirectToLogin("invalid");
  }

  try {
    const profile = await fetchGoogleProfile(code);
    const email = profile.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });

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
            passwordHash: await bcrypt.hash(`google:${profile.sub}:${crypto.randomUUID()}`, 12),
            categories: {
              create: initialCategories.map(([name, color]) => ({ name, color })),
            },
          },
        });

    await setSession(user.id, true);
    return NextResponse.redirect(new URL("/dashboard", env.appUrl));
  } catch (error) {
    console.error("Google login failed.", error);
    return redirectToLogin("failed");
  }
}
