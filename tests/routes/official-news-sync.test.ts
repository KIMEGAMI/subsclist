import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { DAILY_NEWS_MAX_SERVICE_ARTICLES, NEWS_MAX_ITEMS_PER_DAY } from "@/lib/app-constants";
import { uniqueLabel } from "../helpers/database";

const mockFetchNews = vi.hoisted(() => vi.fn(async (url: string) => {
  void url;
  return [] as Array<{
  title: string;
  summaryBase: string;
  sourceUrl: string;
  publishedAt: Date;
  category: string;
  contentHash: string;
  }>;
}));
vi.mock("@/lib/news-feed", () => ({ fetchOfficialNewsFeed: mockFetchNews }));

import { OfficialNewsSyncBusyError, syncOfficialNewsFeeds } from "@/lib/official-news-sync";

const serviceIds: string[] = [];
const testHashes = new Set<string>();

afterEach(async () => {
  mockFetchNews.mockReset();
  await prisma.newsItem.deleteMany({ where: { contentHash: { in: [...testHashes] } } });
  testHashes.clear();
  await prisma.serviceMaster.deleteMany({ where: { id: { in: serviceIds.splice(0) } } });
});

describe("公式ニュース同期の保存上限", () => {
  it("同期中の並行要求ではRSSを再取得せず、日本時間の日次・サービス別上限を守る", async () => {
    const services = await Promise.all(Array.from({ length: 5 }, async (_, index) => prisma.serviceMaster.create({
      data: {
        slug: uniqueLabel(`news-cap-${index}`),
        name: uniqueLabel(`NewsCap${index}`),
        category: "AI",
        officialUrl: "https://example.org",
        newsUrl: `https://example.org/service-${index}/rss`,
        status: "ACTIVE",
      },
    })));
    serviceIds.push(...services.map((service) => service.id));

    let releaseFirstFetch: (() => void) | undefined;
    let markFirstFetchStarted: (() => void) | undefined;
    const firstFetchStarted = new Promise<void>((resolve) => { markFirstFetchStarted = resolve; });
    const firstFetchGate = new Promise<void>((resolve) => { releaseFirstFetch = resolve; });
    mockFetchNews.mockImplementation(async (url) => {
      if (mockFetchNews.mock.calls.length === 1) {
        markFirstFetchStarted?.();
        await firstFetchGate;
      }
      const feedHash = createHash("sha256").update(url).digest("hex");
      return Array.from({ length: 20 }, (_, index) => {
        const contentHash = createHash("sha256").update(`${feedHash}:${index}`).digest("hex");
        testHashes.add(contentHash);
        return {
          title: `料金・提供内容の更新 ${feedHash.slice(0, 8)}-${index}`,
          summaryBase: "料金と提供内容の更新についてのお知らせです。",
          sourceUrl: `https://example.org/news/${feedHash}/${index}`,
          publishedAt: new Date("2035-04-01T00:00:00.000Z"),
          category: "PRICE_CHANGE",
          contentHash,
        };
      });
    });

    const now = new Date("2035-04-06T20:00:00.000Z");
    const firstRequest = syncOfficialNewsFeeds({ serviceIds, now });
    try {
      await firstFetchStarted;
      const secondRequest = syncOfficialNewsFeeds({ serviceIds, now });
      await expect(secondRequest).rejects.toBeInstanceOf(OfficialNewsSyncBusyError);
    } finally {
      releaseFirstFetch?.();
    }
    const first = await firstRequest;
    const dayStart = new Date("2035-04-06T15:00:00.000Z");
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1_000);
    const dailyWhere = {
      fetchedAt: { gte: dayStart, lt: dayEnd },
      sourceType: { in: ["OFFICIAL_RSS", "JAPAN_NEWS_RSS"] },
    };
    const dailyCount = await prisma.newsItem.count({ where: dailyWhere });
    const byService = await prisma.newsItem.groupBy({
      by: ["serviceId"],
      where: { ...dailyWhere, serviceId: { in: serviceIds } },
      _count: { _all: true },
    });

    expect(first.imported).toBe(NEWS_MAX_ITEMS_PER_DAY);
    expect(mockFetchNews).toHaveBeenCalledTimes(10);
    expect(dailyCount).toBe(NEWS_MAX_ITEMS_PER_DAY);
    expect(byService.every((item) => item._count._all <= DAILY_NEWS_MAX_SERVICE_ARTICLES)).toBe(true);
  });
});
