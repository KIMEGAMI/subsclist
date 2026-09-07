type StripeIdentityMetadata = {
  customerUserId?: string | null;
  subscriptionUserId?: string | null;
};

export function storedStripeCustomerCanBelongToUser(
  customerUserId: string | null | undefined,
  userId: string,
) {
  return !customerUserId || customerUserId === userId;
}

export function isStripeRecoveryCandidate(
  metadata: StripeIdentityMetadata,
  userId: string,
) {
  const identityValues = [
    metadata.customerUserId,
    metadata.subscriptionUserId,
  ].filter((value): value is string => Boolean(value));

  return (
    identityValues.length > 0 &&
    identityValues.every((value) => value === userId)
  );
}
