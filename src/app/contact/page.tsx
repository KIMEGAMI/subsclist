import { ContactView } from "@/components/public-views";
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "お問い合わせ",
  description: "ご利用に関する質問や不具合報告を受け付けます。",
  path: "/contact",
});

export default function ContactPage() {
  return <ContactView />;
}
