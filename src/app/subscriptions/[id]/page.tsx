import { SubscriptionDetailView } from "@/components/real-views";

export default async function SubscriptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SubscriptionDetailView id={id} />;
}
