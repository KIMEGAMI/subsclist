import { PrivacyView } from "@/components/public-views";
import { buildPageMetadata } from "@/lib/seo";

export const metadata = buildPageMetadata({
  title: "プライバシーポリシー",
  description: "サブスクリストにおける個人情報の取り扱い方針を説明します。",
  path: "/privacy",
});

export default function PrivacyPage() {
  return <PrivacyView />;
}
