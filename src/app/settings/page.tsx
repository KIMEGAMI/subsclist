import { SettingsView } from "@/components/real-views";

type SettingsPageProps = {
  searchParams?: Promise<{ checkout?: string; session_id?: string }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams;
  return <SettingsView checkoutStatus={params?.checkout} checkoutSessionId={params?.session_id} />;
}
