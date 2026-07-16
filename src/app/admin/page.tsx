import { AdminConsoleView } from "@/components/admin-console";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default function AdminPage() {
  return <AdminConsoleView />;
}
