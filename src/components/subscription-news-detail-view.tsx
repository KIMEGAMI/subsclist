import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell, Card, PageHeader } from "@/components/app-shell";
import { NewsFeedbackButtons } from "@/components/news-feedback-buttons";
import { NewsViewTracker } from "@/components/news-view-tracker";
import { requireVerifiedUser } from "@/lib/auth";
import { accessibleNewsServiceIds } from "@/lib/news-access";
import { sanitizeNewsText } from "@/lib/news-feed";
import { buildNewsDigest } from "@/lib/news-digest";
import { prisma } from "@/lib/prisma";

const publishedDateFormatter = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" });
const subscriptionNewsSourceTypes = ["OFFICIAL_RSS", "JAPAN_NEWS_RSS"];

function sourceLabel(sourceType: string) {
  if (sourceType === "GEMINI_SEARCH") return "AI整理（検索根拠あり）";
  if (sourceType === "GEMINI_RECOMMENDATION") return "おすすめの比較";
  if (sourceType === "JAPAN_NEWS_RSS") return "日本語ニュース";
  return "公式情報";
}

export async function SubscriptionNewsDetailView({ id }: { id: string }) {
  const user = await requireVerifiedUser();
  const [item, services, subscriptions] = await Promise.all([
    prisma.newsItem.findUnique({ where: { id }, include: { service: { select: { id: true, name: true } } } }),
    prisma.serviceMaster.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
    prisma.subscription.findMany({ where: { userId: user.id, status: "ACTIVE", deletedAt: null }, select: { name: true, serviceMasterId: true } }),
  ]);
  if (!item) notFound();
  const serviceIds = accessibleNewsServiceIds({ subscriptions, services });
  const subscriptionArticleAllowed = Boolean(item.serviceId && serviceIds.includes(item.serviceId) && subscriptionNewsSourceTypes.includes(item.sourceType));
  if (!subscriptionArticleAllowed) notFound();
  const feedback = await prisma.userNewsFeedback.findUnique({ where: { userId_newsItemId: { userId: user.id, newsItemId: item.id } }, select: { feedback: true } });
  const publishedLabel = item.publishedAt ? publishedDateFormatter.format(item.publishedAt) : "掲載日未確認";
  const digest = buildNewsDigest({ title: item.title, summary: sanitizeNewsText(item.summaryBase), serviceName: item.service?.name ?? item.sourceName, category: item.category, publishedLabel, sourceName: item.sourceName });

  return <AppShell>
    <PageHeader title="契約ニュース" description={item.service?.name ?? item.sourceName} />
    <Card>
      <NewsViewTracker newsItemId={item.id} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-black text-blue-800">{sourceLabel(item.sourceType)}</span>
        <span className="text-xs font-bold text-slate-500">{item.publishedAt ? publishedDateFormatter.format(item.publishedAt) : "掲載日未確認"}</span>
      </div>
      <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-950">{item.title}</h1>
      <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50/80 p-4"><h2 className="text-sm font-black text-slate-900">この記事の要点</h2><ol className="mt-3 space-y-2 text-sm leading-7 text-slate-700">{digest.map((line, index) => <li key={`${item.id}-digest-${index}`}><span className="mr-2 font-black text-slate-400">{index + 1}.</span>{line}</li>)}</ol></div>
      <NewsFeedbackButtons newsItemId={item.id} initialFeedback={feedback?.feedback as "USEFUL" | "NOT_INTERESTED" | undefined} />
      <p className="mt-5 rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-600">掲載内容は公式情報または日本語ニュースの概要です。契約や料金を変更する前に、必ず参照先の最新情報をご確認ください。</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href={item.sourceUrl} target="_blank" rel="noreferrer" className="btn-primary">根拠のページを開く</Link>
        <Link href="/subscription-news" className="btn-secondary">契約ニュースへ戻る</Link>
      </div>
    </Card>
  </AppShell>;
}
