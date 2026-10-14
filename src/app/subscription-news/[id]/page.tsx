import type { Metadata } from "next";
import { SubscriptionNewsDetailView } from "@/components/subscription-news-detail-view";

export const metadata: Metadata = {
  title: "契約ニュース | SubscList",
  robots: { index: false, follow: false },
};

export default async function SubscriptionNewsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SubscriptionNewsDetailView id={id} />;
}
