export function wantsStripeCheckoutRedirect({
  accept,
  contentType,
}: {
  accept: string | null;
  contentType: string | null;
}) {
  return ![accept, contentType].some((value) =>
    value?.toLowerCase().includes("application/json"),
  );
}
