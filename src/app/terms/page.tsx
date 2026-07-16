import { TermsView } from "@/components/public-views";
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "利用規約",
  description: "サブスクリストの利用条件と免責事項をまとめています。",
  path: "/terms",
});

export default function TermsPage() {
  return <TermsView />;
}
