import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  decodeSignedSession,
  encodeSignedSession,
  type SessionPayload,
} from "./signed-session.ts";

const secret = "test-session-secret-that-is-at-least-32-characters";
const payload: SessionPayload = {
  userId: "test-user",
  emailVerified: true,
  sessionVersion: 2,
  exp: 2_000,
};

function signBody(body: string) {
  return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

test("署名済みセッションを復号できる", () => {
  const encoded = encodeSignedSession(payload, secret);
  assert.deepEqual(decodeSignedSession(encoded, secret, 1_000), payload);
});

test("改ざん、署名不一致、余分な項目を拒否する", () => {
  const encoded = encodeSignedSession(payload, secret);
  const [body, signature] = encoded.split(".");
  assert.equal(
    decodeSignedSession(`${body}x.${signature}`, secret, 1_000),
    null,
  );
  assert.equal(decodeSignedSession(encoded, `${secret}x`, 1_000), null);

  const invalidBody = Buffer.from(
    JSON.stringify({ ...payload, role: "admin" }),
  ).toString("base64url");
  assert.equal(
    decodeSignedSession(
      `${invalidBody}.${signBody(invalidBody)}`,
      secret,
      1_000,
    ),
    null,
  );
});

test("有効期限の時刻に達したセッションを拒否する", () => {
  const encoded = encodeSignedSession(payload, secret);
  assert.equal(decodeSignedSession(encoded, secret, payload.exp), null);
  assert.equal(decodeSignedSession(encoded, secret, payload.exp + 1), null);
});
