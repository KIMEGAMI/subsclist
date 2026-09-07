import crypto from "node:crypto";
import { z } from "zod";
import { MAX_SESSION_USER_ID_LENGTH } from "./app-constants.ts";

const sessionPayloadSchema = z
  .object({
    userId: z.string().min(1).max(MAX_SESSION_USER_ID_LENGTH),
    emailVerified: z.boolean(),
    sessionVersion: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
  })
  .strict();

export type SessionPayload = z.infer<typeof sessionPayloadSchema>;

function signature(body: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

function secureSignatureEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function encodeSignedSession(payload: SessionPayload, secret: string) {
  const parsed = sessionPayloadSchema.parse(payload);
  const body = Buffer.from(JSON.stringify(parsed)).toString("base64url");
  return `${body}.${signature(body, secret)}`;
}

export function decodeSignedSession(
  value: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [body, actualSignature] = parts;
  if (
    !body ||
    !actualSignature ||
    !secureSignatureEqual(actualSignature, signature(body, secret))
  )
    return null;

  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    );
    const payload = sessionPayloadSchema.safeParse(decoded);
    if (!payload.success || payload.data.exp <= nowSeconds) return null;
    return payload.data;
  } catch {
    return null;
  }
}
