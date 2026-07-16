import { SettingsView } from "@/components/admin-views";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default function SettingsPage() {
  return <SettingsView />;
}
