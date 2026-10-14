export function requestClientIdentifier(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const forwardedAddresses = forwardedFor
    ?.split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  return (
    forwardedAddresses?.[forwardedAddresses.length - 1] ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
