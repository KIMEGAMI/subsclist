import { ExportView } from "@/components/subscription-views";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default function ExportPage() {
  return <ExportView />;
}
