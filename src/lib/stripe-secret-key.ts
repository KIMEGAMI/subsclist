export const STRIPE_LIVE_MODE_NOT_ALLOWED_ERROR =
  "Stripe Live mode requires STRIPE_LIVE_MODE_ALLOWED=true and is disabled in test environments.";

export function isStripeServerSecretKey(secretKey: string) {
  return secretKey.startsWith("sk_test_") || secretKey.startsWith("sk_live_");
}

export function isStripeLiveModeAllowed(
  secretKey: string,
  allowLiveMode: string | undefined,
  nodeEnvironment: string | undefined,
) {
  return (
    !secretKey.startsWith("sk_live_") ||
    (allowLiveMode === "true" && nodeEnvironment !== "test")
  );
}
