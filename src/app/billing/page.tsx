import type { Metadata } from "next";
import { BillingView } from "@/components/real-views";

export const metadata: Metadata = {
  title: "契約・解約 | SubscList",
  robots: { index: false, follow: false },
};

type BillingPageProps = {
  searchParams?: Promise<{ checkout?: string; session_id?: string }>;
};

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const params = await searchParams;
  return (
    <BillingView checkoutStatus={params?.checkout} checkoutSessionId={params?.session_id} />
  );
}
