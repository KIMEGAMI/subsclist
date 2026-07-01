import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { assertGoogleEnv, env } from "@/lib/env";

const stateCookie = "subsclist_google_oauth_state";

export async function GET() {
  try {
    assertGoogleEnv();
  } catch {
    const url = new URL("/login", env.appUrl);
    url.searchParams.set("google", "config");
    return NextResponse.redirect(url);
  }

  const state = crypto.randomBytes(24).toString("base64url");
  const redirectUri = new URL("/api/auth/google/callback", env.appUrl).toString();
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", env.googleClientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  const cookieStore = await cookies();
  cookieStore.set(stateCookie, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  return NextResponse.redirect(authUrl);
}

