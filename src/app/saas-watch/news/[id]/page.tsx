import { redirect } from "next/navigation";

export default async function SaasWatchNewsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/subscription-news/${id}`);
}
