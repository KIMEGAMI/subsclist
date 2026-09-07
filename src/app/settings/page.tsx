import { SettingsView } from "@/components/real-views";

type SettingsPageProps = {
  searchParams?: Promise<{ "email-change"?: string }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = await searchParams;
  return <SettingsView emailChangeStatus={params?.["email-change"]} />;
}
