import { BillingView } from "@/components/admin-views";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default function BillingPage() {
  return <BillingView />;
}
