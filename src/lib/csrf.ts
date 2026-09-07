const csrfExemptApiPaths = new Set([
  "/api/stripe/webhook",
  "/api/notifications/send",
]);
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function toOrigin(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function requiresCsrfValidation(pathname: string, method: string) {
  return (
    pathname.startsWith("/api/") &&
    unsafeMethods.has(method.toUpperCase()) &&
    !csrfExemptApiPaths.has(pathname)
  );
}

export function hasTrustedRequestOrigin({
  requestUrl,
  originHeader,
  refererHeader,
  configuredUrls,
}: {
  requestUrl: string;
  originHeader: string | null;
  refererHeader: string | null;
  configuredUrls: Array<string | null | undefined>;
}) {
  const configuredOrigins = configuredUrls
    .map(toOrigin)
    .filter((origin): origin is string => origin !== null);
  const fallbackOrigin = toOrigin(requestUrl);
  const allowedOrigins = new Set(
    configuredOrigins.length > 0
      ? configuredOrigins
      : [fallbackOrigin].filter(Boolean),
  );

  if (originHeader) {
    const origin = toOrigin(originHeader);
    return origin !== null && allowedOrigins.has(origin);
  }

  const refererOrigin = toOrigin(refererHeader);
  return refererOrigin !== null && allowedOrigins.has(refererOrigin);
}
