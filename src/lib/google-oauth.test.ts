import assert from "node:assert/strict";
import test from "node:test";
import {
  createGoogleOAuthRequest,
  secureOAuthValueEqual,
} from "./google-oauth.ts";

test("Google OAuth要求ごとにstateとPKCEを生成する", () => {
  const first = createGoogleOAuthRequest();
  const second = createGoogleOAuthRequest();
  assert.notEqual(first.state, second.state);
  assert.notEqual(first.codeVerifier, second.codeVerifier);
  assert.equal(first.state.length >= 43, true);
  assert.equal(first.codeVerifier.length >= 43, true);
  assert.equal(first.codeChallenge.length >= 43, true);
});

test("OAuth値は完全一致した場合だけ受理する", () => {
  const value = createGoogleOAuthRequest().state;
  assert.equal(secureOAuthValueEqual(value, value), true);
  assert.equal(secureOAuthValueEqual(value, `${value}x`), false);
  assert.equal(secureOAuthValueEqual(value, null), false);
});
