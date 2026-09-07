import { AnnualBusinessReportView } from "@/components/real-views";

export default async function AnnualReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string | string[] }>;
}) {
  const value = (await searchParams).year;
  return <AnnualBusinessReportView year={typeof value === "string" ? value : undefined} />;
}
