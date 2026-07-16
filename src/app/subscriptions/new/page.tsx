import { SubscriptionFormView } from "@/components/subscription-views";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default function NewSubscriptionPage() {
  return <SubscriptionFormView />;
}
