import { createHash, timingSafeEqual } from "node:crypto";

const minimumJobSecretBytes = 32;
const placeholderPattern = /(?:replace|placeholder|change[-_ ]?me|your[-_ ]?(?:secret|token)|example\.(?:com|invalid|test))/i;

export function isAcceptableJobSecret(secret: string) {
  return Buffer.byteLength(secret, "utf8") >= minimumJobSecretBytes
    && secret === secret.trim()
    && !/[\u0000-\u001f\u007f]/u.test(secret) // eslint-disable-line no-control-regex -- rejects unsafe control characters
    && !placeholderPattern.test(secret);
}

export function isAuthorizedJobRequest(secret: string, authorization: string | null) {
  if (!isAcceptableJobSecret(secret) || !authorization?.startsWith("Bearer ")) return false;
  const provided = authorization.slice("Bearer ".length);
  if (!provided) return false;

  const expectedDigest = createHash("sha256").update(secret, "utf8").digest();
  const providedDigest = createHash("sha256").update(provided, "utf8").digest();
  return timingSafeEqual(expectedDigest, providedDigest);
}
