import { AnalyticsView } from "@/components/subscription-views";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default function AnalyticsPage() {
  return <AnalyticsView />;
}
