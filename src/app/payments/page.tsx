import { PaymentsView } from "@/components/real-views";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string | string[]; organization?: string | string[]; missing?: string | string[] }>;
}) {
  const values = await searchParams;
  return <PaymentsView
    year={typeof values.year === "string" ? values.year : undefined}
    organization={typeof values.organization === "string" ? values.organization : undefined}
    missing={typeof values.missing === "string" ? values.missing : undefined}
  />;
}
