import { SubscriptionsView } from "@/components/real-views";
import { normalizeSubscriptionListFilters } from "@/lib/subscription-list";

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = normalizeSubscriptionListFilters(await searchParams);
  return <SubscriptionsView filters={filters} />;
}
