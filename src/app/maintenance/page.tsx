import { MaintenanceView } from "@/components/public-views";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default function MaintenancePage() {
  return <MaintenanceView />;
}
