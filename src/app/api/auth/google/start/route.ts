import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { assertGoogleEnv, env } from "@/lib/env";
import {
  createGoogleOAuthRequest,
  GOOGLE_OAUTH_CALLBACK_PATH,
  GOOGLE_OAUTH_COOKIE_MAX_AGE_SECONDS,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_VERIFIER_COOKIE,
} from "@/lib/google-oauth";

export async function GET() {
  try {
    assertGoogleEnv();
  } catch {
    const url = new URL("/login", env.appUrl);
    url.searchParams.set("google", "config");
    return NextResponse.redirect(url);
  }

  const { state, codeVerifier, codeChallenge } = createGoogleOAuthRequest();
  const redirectUri = new URL(
    GOOGLE_OAUTH_CALLBACK_PATH,
    env.appUrl,
  ).toString();
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", env.googleClientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("prompt", "select_account");

  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: GOOGLE_OAUTH_CALLBACK_PATH,
    maxAge: GOOGLE_OAUTH_COOKIE_MAX_AGE_SECONDS,
  };
  cookieStore.set(GOOGLE_OAUTH_STATE_COOKIE, state, cookieOptions);
  cookieStore.set(GOOGLE_OAUTH_VERIFIER_COOKIE, codeVerifier, cookieOptions);

  return NextResponse.redirect(authUrl);
}
