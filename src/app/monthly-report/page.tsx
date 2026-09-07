import { MonthlyReportView } from "@/components/real-views";

export default async function MonthlyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const value = (await searchParams).month;
  return <MonthlyReportView month={typeof value === "string" ? value : undefined} />;
}
