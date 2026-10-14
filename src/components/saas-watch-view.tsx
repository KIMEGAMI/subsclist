import Link from "next/link";
import { AppShell, Card, PageHeader } from "@/components/app-shell";
import { ServiceWatchToggle } from "@/components/service-watch-toggle";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function SaasWatchView({ query = "" }: { query?: string }) {
  const user = await requireVerifiedUser();
  const normalizedQuery = query.trim().slice(0, 80);
  const services = await prisma.serviceMaster.findMany({
    where: { status: "ACTIVE", ...(normalizedQuery ? { OR: [
      { name: { contains: normalizedQuery } },
      { slug: { contains: normalizedQuery } },
      { category: { contains: normalizedQuery } },
    ] } : {}) },
    select: { id: true, name: true, category: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  const [watchlist, subscriptions] = await Promise.all([
    prisma.serviceWatchlist.findMany({ where: { userId: user.id }, select: { serviceId: true } }),
    prisma.subscription.findMany({ where: { userId: user.id, status: "ACTIVE", deletedAt: null }, select: { serviceMasterId: true } }),
  ]);
  const watchedIds = new Set(watchlist.map((item) => item.serviceId));
  const contractedIds = new Set(subscriptions.flatMap((item) => item.serviceMasterId ? [item.serviceMasterId] : []));
  return <AppShell>
    <PageHeader title="SaaS Watch" description="気になるサービスを探し、価格や公式ニュースの更新を見逃さないようにします。" />
    <Card>
      <form method="get" className="flex flex-col gap-3 sm:flex-row"><label className="sr-only" htmlFor="service-search">サービスを検索</label><input id="service-search" name="q" defaultValue={normalizedQuery} className="input flex-1" placeholder="サービス名・カテゴリで検索" maxLength={80} /><button type="submit" className="btn-primary shrink-0">検索</button>{normalizedQuery && <Link href="/saas-watch" className="btn-secondary shrink-0">条件をクリア</Link>}</form>
      <div className="mt-5 flex items-center justify-between gap-3"><h2 className="text-lg font-black">サービス一覧</h2><span className="text-sm font-bold text-slate-500">{services.length}件</span></div>
      {services.length === 0 ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm font-semibold text-slate-600">一致するサービスが見つかりません。通常の契約登録からサービス名を登録できます。</p> : <div className="mt-4 grid gap-4 md:grid-cols-2">{services.map((service) => { const isContracted = contractedIds.has(service.id); const isWatched = watchedIds.has(service.id); return <article key={service.id} className="rounded-lg border border-slate-200 bg-white/80 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-blue-700">{service.category}</p><h3 className="mt-1 text-lg font-black text-slate-950">{service.name}</h3></div>{isContracted && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-800">契約中</span>}</div><div className="mt-4 flex flex-wrap items-center gap-2"><Link href={`/saas-watch/services/${service.id}`} className="btn-secondary">詳細を見る</Link>{!isContracted && <ServiceWatchToggle serviceId={service.id} watching={isWatched} />}</div></article>; })}</div>}
    </Card>
  </AppShell>;
}
