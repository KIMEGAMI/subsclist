import { redirect } from "next/navigation";

export const metadata = { robots: { index: false, follow: false } };

export default function SaasWatchPage() {
  redirect("/subscription-news");
}
