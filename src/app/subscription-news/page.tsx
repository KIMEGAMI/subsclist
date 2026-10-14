import type { Metadata } from "next";
import { SubscriptionNewsView } from "@/components/subscription-news-view";

export const metadata: Metadata = {
  title: "契約ニュース | SubscList",
  robots: { index: false, follow: false },
};

export default async function SubscriptionNewsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  return <SubscriptionNewsView page={params.page} />;
}
