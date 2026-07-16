import { FaqView } from "@/components/public-views";
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "FAQ",
  description: "よくある質問をまとめています。",
  path: "/faq",
});

export default function FaqPage() {
  return <FaqView />;
}
