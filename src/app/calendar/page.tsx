import { CalendarView } from "@/components/real-views";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  return <CalendarView month={month} />;
}
