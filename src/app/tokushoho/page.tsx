import { TokushohoView } from "@/components/public-views";
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "特定商取引法に基づく表記",
  description: "販売事業者情報や料金、返品・解約に関する案内をまとめています。",
  path: "/tokushoho",
});

export default function TokushohoPage() {
  return <TokushohoView />;
}
