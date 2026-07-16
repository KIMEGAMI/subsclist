import { SubscriptionFormView } from "@/components/subscription-views";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default async function EditSubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SubscriptionFormView id={id} />;
}
