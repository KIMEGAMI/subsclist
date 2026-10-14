import mariadb from "mariadb";
import { fetchOfficialNewsFeed } from "@/lib/news-feed";
import { DAILY_NEWS_MAX_SERVICE_ARTICLES, NEWS_MAX_ITEMS_PER_DAY } from "@/lib/app-constants";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

function isRssOrAtomFeedUrl(value: string) {
  try {
    const url = new URL(value);
    return url.hostname === "news.google.com"
      || url.pathname.endsWith("/feed/")
      || url.pathname.endsWith("/feed")
      || url.pathname.endsWith("/rss/")
      || url.pathname.endsWith("/rss")
      || url.pathname.endsWith(".xml");
  } catch {
    return false;
  }
}

export type OfficialNewsSyncResult = {
  imported: number;
  failedServices: string[];
};

export class OfficialNewsSyncBusyError extends Error {
  constructor() {
    super("ニュース同期はすでに実行中です。");
    this.name = "OfficialNewsSyncBusyError";
  }
}

type PendingNewsItem = {
  serviceId: string;
  sourceName: string;
  sourceType: "OFFICIAL_RSS" | "JAPAN_NEWS_RSS";
  trustLevel: "OFFICIAL" | "VERIFIED";
  item: Awaited<ReturnType<typeof fetchOfficialNewsFeed>>[number];
};

function japaneseNewsFeedUrl(serviceName: string) {
  const query = `${serviceName} (料金 OR プラン OR 値上げ OR 障害 OR 終了 OR 仕様変更)`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ja&gl=JP&ceid=JP:ja`;
}

function japanDayStart(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return new Date(`${values.get("year")}-${values.get("month")}-${values.get("day")}T00:00:00+09:00`);
}

export async function syncOfficialNewsFeeds(options?: { serviceIds?: string[]; now?: Date }): Promise<OfficialNewsSyncResult> {
  let imported = 0;
  const failedServices: string[] = [];
  const pendingItems: PendingNewsItem[] = [];
  const lockName = "subsclist_news_daily_cap";

  const databaseUrl = new URL(env.databaseUrl);
  const lockConnection = await mariadb.createConnection({
    host: databaseUrl.hostname,
    port: Number(databaseUrl.port || "3306"),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: databaseUrl.pathname.replace(/^\//, ""),
    charset: "utf8mb4",
  });
  let lockAcquired = false;
  let operationError: unknown;
  let releaseError: Error | null = null;
  try {
    const lockRows = await lockConnection.query("SELECT GET_LOCK(?, 0) AS acquired", [lockName]) as Array<{ acquired: number | bigint | null }>;
    if (Number(lockRows[0]?.acquired) !== 1) throw new OfficialNewsSyncBusyError();
    lockAcquired = true;

    const services = await prisma.serviceMaster.findMany({
      where: {
        status: "ACTIVE",
        ...(options?.serviceIds ? { id: { in: options.serviceIds } } : {}),
      },
      select: { id: true, name: true, newsUrl: true },
    });
    for (const service of services) {
      const feedSources: Array<{
        url: string;
        sourceType: PendingNewsItem["sourceType"];
        sourceName: string;
        trustLevel: PendingNewsItem["trustLevel"];
      }> = [
        service.newsUrl && isRssOrAtomFeedUrl(service.newsUrl)
          ? { url: service.newsUrl, sourceType: "OFFICIAL_RSS" as const, sourceName: service.name, trustLevel: "OFFICIAL" as const }
          : null,
        { url: japaneseNewsFeedUrl(service.name), sourceType: "JAPAN_NEWS_RSS" as const, sourceName: `${service.name}（日本語ニュース）`, trustLevel: "VERIFIED" as const },
      ].filter((source): source is NonNullable<typeof source> => source !== null);
      for (const source of feedSources) {
        try {
          const items = await fetchOfficialNewsFeed(source.url);
          pendingItems.push(...items.map((item) => ({ serviceId: service.id, sourceName: source.sourceName, sourceType: source.sourceType, trustLevel: source.trustLevel, item })));
        } catch {
          failedServices.push(source.sourceName);
          console.error("News feed sync failed.");
        }
      }
    }

    const uniquePendingItems = [...new Map(pendingItems.map((pending) => [pending.item.contentHash, pending])).values()];
    uniquePendingItems.sort((left, right) => (right.item.publishedAt?.getTime() ?? 0) - (left.item.publishedAt?.getTime() ?? 0));
    const now = options?.now ?? new Date();
    const dayStart = japanDayStart(now);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1_000);
    imported = await prisma.$transaction(async (tx) => {
        const dailyWhere = {
          fetchedAt: { gte: dayStart, lt: dayEnd },
          sourceType: { in: ["OFFICIAL_RSS", "JAPAN_NEWS_RSS"] },
        };
        const [todayCount, serviceCounts, existingHashes] = await Promise.all([
          tx.newsItem.count({ where: dailyWhere }),
          tx.newsItem.groupBy({ by: ["serviceId"], where: { ...dailyWhere, serviceId: { not: null } }, _count: { _all: true } }),
          uniquePendingItems.length > 0
            ? tx.newsItem.findMany({ where: { contentHash: { in: uniquePendingItems.map((pending) => pending.item.contentHash) } }, select: { contentHash: true } })
            : Promise.resolve([]),
        ]);
        const existingHashSet = new Set(existingHashes.map((item) => item.contentHash));
        const importedByService = new Map(serviceCounts.flatMap((item) => item.serviceId ? [[item.serviceId, item._count._all] as const] : []));
        let newItems = 0;

        for (const pending of uniquePendingItems) {
          if (newItems >= NEWS_MAX_ITEMS_PER_DAY - todayCount) break;
          if (existingHashSet.has(pending.item.contentHash)) continue;
          const serviceCount = importedByService.get(pending.serviceId) ?? 0;
          if (serviceCount >= DAILY_NEWS_MAX_SERVICE_ARTICLES) continue;

          await tx.newsItem.create({
            data: {
              serviceId: pending.serviceId,
              title: pending.item.title,
              summaryBase: pending.item.summaryBase,
              sourceUrl: pending.item.sourceUrl,
              sourceName: pending.sourceName,
              sourceType: pending.sourceType,
              publishedAt: pending.item.publishedAt,
              fetchedAt: now,
              category: pending.item.category,
              importance: 0,
              trustLevel: pending.trustLevel,
              contentHash: pending.item.contentHash,
            },
          });
          existingHashSet.add(pending.item.contentHash);
          importedByService.set(pending.serviceId, serviceCount + 1);
          newItems += 1;
        }

        return newItems;
    }, { maxWait: 15_000, timeout: 30_000 });
  } catch (error) {
    operationError = error;
  } finally {
    if (lockAcquired) {
      try {
        const releasedRows = await lockConnection.query("SELECT RELEASE_LOCK(?) AS released", [lockName]) as Array<{ released: number | bigint | null }>;
        if (Number(releasedRows[0]?.released) !== 1) releaseError = new Error("News daily import lock was not released.");
      } catch (error) {
        releaseError = error instanceof Error ? error : new Error("News daily import lock release failed.");
      }
    }
    try {
      await lockConnection.end();
    } catch (error) {
      if (!operationError && !releaseError) operationError = error;
    }
  }
  if (operationError) throw operationError;
  if (releaseError) throw releaseError;

  return { imported, failedServices };
}
