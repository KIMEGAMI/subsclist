import { SubscriptionFormView } from "@/components/real-views";

export default async function EditSubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SubscriptionFormView id={id} />;
}
