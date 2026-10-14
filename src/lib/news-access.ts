export type NewsAccessSubscription = {
  name: string;
  serviceMasterId: string | null;
};

export type NewsAccessService = {
  id: string;
  name: string;
};

export function normalizedServiceName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
}

export function serviceIdForSubscription(
  subscription: NewsAccessSubscription,
  services: NewsAccessService[],
) {
  if (subscription.serviceMasterId) return subscription.serviceMasterId;
  const normalizedSubscriptionName = normalizedServiceName(subscription.name);
  return services.find((service) => normalizedServiceName(service.name) === normalizedSubscriptionName)?.id ?? null;
}

export function accessibleNewsServiceIds({
  subscriptions,
  services,
}: {
  subscriptions: NewsAccessSubscription[];
  services: NewsAccessService[];
}) {
  const serviceIds = new Set(
    subscriptions
      .map((subscription) => subscription.serviceMasterId)
      .filter((serviceId): serviceId is string => Boolean(serviceId)),
  );
  for (const subscription of subscriptions) {
    const exactServiceId = serviceIdForSubscription(subscription, services);
    if (exactServiceId) serviceIds.add(exactServiceId);
  }
  return [...serviceIds];
}
