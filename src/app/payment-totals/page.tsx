import { PaymentTotalsView } from "@/components/real-views";

export default async function PaymentTotalsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string | string[] }>;
}) {
  const value = (await searchParams).year;
  return <PaymentTotalsView year={typeof value === "string" ? value : undefined} />;
}
