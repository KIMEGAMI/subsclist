import { PricingView } from "@/components/auth-views";
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "料金",
  description: "Freeと月額480円のPremiumの違いを確認できる料金ページです。",
  path: "/pricing",
});

export default function PricingPage() {
  return <PricingView />;
}
