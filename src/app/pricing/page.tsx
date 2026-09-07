import type { Metadata } from "next";
import { PricingView } from "@/components/auth-views";
import { PREMIUM_MONTHLY_PRICE_YEN, STRIPE_TRIAL_PERIOD_DAYS } from "@/lib/app-constants";

export const metadata: Metadata = {
  title: "料金プラン | SubscList",
  description: `SubscListのFreeプランと、初回のみ${STRIPE_TRIAL_PERIOD_DAYS}日間お試し無料の月額${PREMIUM_MONTHLY_PRICE_YEN}円Premiumプランを比較できます。`,
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return <PricingView />;
}
