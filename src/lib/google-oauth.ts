import crypto from "node:crypto";

export const GOOGLE_OAUTH_CALLBACK_PATH = "/api/auth/google/callback";
export const GOOGLE_OAUTH_STATE_COOKIE = "subsclist_google_oauth_state";
export const GOOGLE_OAUTH_VERIFIER_COOKIE = "subsclist_google_oauth_verifier";
export const GOOGLE_OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;
export const GOOGLE_OAUTH_FETCH_TIMEOUT_MS = 10_000;

export function createGoogleOAuthRequest() {
  const state = crypto.randomBytes(32).toString("base64url");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { state, codeVerifier, codeChallenge };
}

export function secureOAuthValueEqual(
  actual?: string | null,
  expected?: string | null,
) {
  if (!actual || !expected) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
