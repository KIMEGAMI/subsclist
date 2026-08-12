import type { Metadata } from "next";
import { PricingView } from "@/components/auth-views";

export const metadata: Metadata = {
  title: "料金プラン | SubscList",
  description: "SubscListのFreeプランと月額480円のPremiumプランを比較できます。",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return <PricingView />;
}
