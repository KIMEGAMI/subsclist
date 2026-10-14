import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { AppShell, Card, PageHeader } from "@/components/app-shell";
import { NewsFeedbackButtons } from "@/components/news-feedback-buttons";
import { NewsRefreshButton } from "@/components/news-refresh-button";
import { requireVerifiedUser } from "@/lib/auth";
import { accessibleNewsServiceIds } from "@/lib/news-access";
import { sanitizeNewsText } from "@/lib/news-feed";
import { prisma } from "@/lib/prisma";

const newsDateFormatter = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" });
const newsPageSize = 10;
type NewsRow = Prisma.NewsItemGetPayload<{ include: { service: { select: { name: true } } } }>;

function normalizePage(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function pageNumbers(page: number, totalPages: number) {
  if (totalPages <= 8) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (page <= 6) return [1, 2, 3, 4, 5, 6, 7, -1, totalPages];
  if (page >= totalPages - 5) return [1, -1, totalPages - 6, totalPages - 5, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, -1, page - 1, page, page + 1, -1, totalPages];
}

export async function SubscriptionNewsView({ page: pageValue }: { page?: string }) {
  const user = await requireVerifiedUser();
  const requestedPage = normalizePage(pageValue);
  const [services, subscriptions] = await Promise.all([
    prisma.serviceMaster.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
    prisma.subscription.findMany({ where: { userId: user.id, status: "ACTIVE", deletedAt: null }, select: { name: true, serviceMasterId: true } }),
  ]);
  const serviceIds = new Set(accessibleNewsServiceIds({ subscriptions, services }));
  const newsWhere: Prisma.NewsItemWhereInput = { serviceId: { in: [...serviceIds] }, sourceType: { in: ["OFFICIAL_RSS", "JAPAN_NEWS_RSS"] }, trustLevel: { in: ["OFFICIAL", "VERIFIED"] } };
  const totalNews = serviceIds.size === 0 ? 0 : await prisma.newsItem.count({ where: newsWhere });
  const totalPages = Math.max(1, Math.ceil(totalNews / newsPageSize));
  const page = Math.min(requestedPage, totalPages);
  const newsCandidates: NewsRow[] = serviceIds.size === 0
    ? []
    : await prisma.newsItem.findMany({
      where: newsWhere,
      include: { service: { select: { name: true } } },
      orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
      skip: (page - 1) * newsPageSize,
      take: newsPageSize,
    });
  const feedbacks = await prisma.userNewsFeedback.findMany({ where: { userId: user.id, newsItemId: { in: newsCandidates.map((item) => item.id) } }, select: { newsItemId: true, feedback: true } });
  const feedbackByNewsId = new Map(feedbacks.map((item) => [item.newsItemId, item.feedback]));
  const newsItems = newsCandidates;
  const title = serviceIds.size === 0 ? "契約ニュース" : "あなたに関係する公式更新";
  const description = serviceIds.size === 0
    ? "契約中のサブスクがないため、関連ニュースはありません。"
    : "現在契約中のサブスクに関係する公式情報だけを表示します。";
  return <AppShell>
    <PageHeader title="契約ニュース" description={description} />
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-black">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-600">「最新情報を取得」を押すと、契約中のサブスクに関係する公式情報と日本語ニュースを確認します。自動更新は行いません。</p></div><div className="flex flex-wrap items-center gap-3"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-slate-800">{totalNews}件</span><NewsRefreshButton /></div></div>
      {newsItems.length === 0 ? <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm leading-6 text-slate-600">{serviceIds.size === 0 ? "契約中のサブスクがありません。" : "保存された公式ニュースはありません。"}</div> : <>
        <div className="mt-4 divide-y divide-slate-100">{newsItems.map((item) => <article key={item.id} className="py-5 first:pt-0 last:pb-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{item.service?.name ?? item.sourceName}</span><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-800">{item.sourceType === "JAPAN_NEWS_RSS" ? "日本語ニュース" : "公式情報"}</span><span className="text-xs font-bold text-slate-500">{item.publishedAt ? newsDateFormatter.format(item.publishedAt) : "掲載日未確認"}</span></div><p className="mt-2 text-xs font-bold text-slate-500">表示理由: 契約中のサブスク</p><Link href={`/subscription-news/${item.id}`} className="mt-2 block text-lg font-black leading-7 text-blue-700 hover:underline">{item.title}</Link><p className="mt-2 line-clamp-4 text-sm leading-7 text-slate-700">{sanitizeNewsText(item.summaryBase) ?? "概要は参照元で確認できます。"}</p><p className="mt-2 text-xs leading-6 text-slate-500">料金・プラン・提供条件の変更がないか確認し、必要に応じて原文を確認してください。</p><NewsFeedbackButtons newsItemId={item.id} initialFeedback={feedbackByNewsId.get(item.id) as "USEFUL" | "NOT_INTERESTED" | undefined} /></article>)}</div>
        {totalPages > 1 && <nav className="mt-6 flex flex-wrap items-center justify-center gap-2" aria-label="ニュースのページ"><span className="mr-2 text-xs font-bold text-slate-500">{totalNews}件</span>{page > 1 && <Link href={`/subscription-news?page=${page - 1}`} className="rounded-md px-2 py-1 text-sm font-bold text-blue-700 hover:bg-blue-50">前へ</Link>}{pageNumbers(page, totalPages).map((number, index) => number === -1 ? <span key={`ellipsis-${index}`} className="px-1 text-slate-400">…</span> : <Link key={number} href={`/subscription-news?page=${number}`} aria-current={number === page ? "page" : undefined} className={`min-w-8 rounded-md px-2 py-1 text-center text-sm font-bold ${number === page ? "bg-blue-700 text-white" : "text-blue-700 hover:bg-blue-50"}`}>{number}</Link>)}{page < totalPages && <Link href={`/subscription-news?page=${page + 1}`} className="rounded-md px-2 py-1 text-sm font-bold text-blue-700 hover:bg-blue-50">次へ</Link>}</nav>}
      </>}
    </Card>
  </AppShell>;
}
