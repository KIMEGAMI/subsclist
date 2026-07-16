import { SubscriptionDetailView } from "@/components/subscription-views";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default async function SubscriptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SubscriptionDetailView id={id} />;
}
