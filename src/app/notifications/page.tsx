import { NotificationsView } from "@/components/admin-views";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default function NotificationsPage() {
  return <NotificationsView />;
}
