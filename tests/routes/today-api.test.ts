import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: new Response(null, { status: 401 }) },
}));

import { GET as getToday } from "@/app/api/today/route";

const userIds: string[] = [];
const serviceIds: string[] = [];
const newsIds: string[] = [];

afterEach(async () => {
  authState.user = null;
  await prisma.newsItem.deleteMany({ where: { id: { in: newsIds.splice(0) } } });
  await prisma.serviceMaster.deleteMany({ where: { id: { in: serviceIds.splice(0) } } });
  await deleteTestUsers(...userIds.splice(0));
});

describe("Today集約API", () => {
  it("未認証のAPI呼び出しはリダイレクトせず401を返す", async () => {
    const response = await getToday();
    expect(response.status).toBe(401);
  });

  it("Freeは10件に制限し、本人のニュースと価格変更だけを返す", async () => {
    const user = await createTestUser({ plan: "FREE" });
    const other = await createTestUser({ plan: "PREMIUM" });
    userIds.push(user.id, other.id);

    const service = await prisma.serviceMaster.create({
      data: {
        slug: uniqueLabel("today-owned"),
        name: "Today対象サービス",
        category: "AI",
        officialUrl: "https://example.org",
        status: "ACTIVE",
      },
    });
    const foreignService = await prisma.serviceMaster.create({
      data: {
        slug: uniqueLabel("today-foreign"),
        name: "他ユーザーサービス",
        category: "動画",
        officialUrl: "https://example.net",
        status: "ACTIVE",
      },
    });
    serviceIds.push(service.id, foreignService.id);

    const nextBillingDate = new Date(Date.now() + 30 * 86_400_000);
    await prisma.subscription.createMany({
      data: Array.from({ length: 12 }, (_, index) => ({
        userId: user.id,
        serviceMasterId: index === 0 ? service.id : undefined,
        name: index === 0 ? service.name : `Free契約${index + 1}`,
        price: 980 + index,
        billingCycle: "MONTHLY" as const,
        nextBillingDate: new Date(nextBillingDate.getTime() + index * 86_400_000),
      })),
    });
    await prisma.subscription.create({
      data: {
        userId: other.id,
        serviceMasterId: foreignService.id,
        name: foreignService.name,
        price: 9_800,
        billingCycle: "MONTHLY",
        nextBillingDate,
      },
    });
    await prisma.serviceWatchlist.create({ data: { userId: user.id, serviceId: foreignService.id, watchNews: true } });

    const news = await prisma.newsItem.create({
      data: {
        serviceId: service.id,
        title: "契約中サービスの公式更新",
        summaryBase: "本人の契約に関係する更新です。",
        sourceName: "公式",
        sourceUrl: "https://example.org/news",
        sourceType: "OFFICIAL_RSS",
        category: "MAJOR_UPDATE",
        trustLevel: "OFFICIAL",
        contentHash: uniqueLabel("today-news"),
      },
    });
    const foreignNews = await prisma.newsItem.create({
      data: {
        serviceId: foreignService.id,
        title: "他ユーザーの公式更新",
        sourceName: "公式",
        sourceUrl: "https://example.net/news",
        sourceType: "OFFICIAL_RSS",
        category: "MAJOR_UPDATE",
        trustLevel: "OFFICIAL",
        contentHash: uniqueLabel("today-foreign-news"),
      },
    });
    newsIds.push(news.id, foreignNews.id);
    await prisma.servicePriceChange.create({
      data: {
        serviceId: service.id,
        planName: "Pro",
        oldAmount: 980,
        newAmount: 1_280,
        changeAmount: 300,
        changePercent: 30.61,
        currency: "JPY",
        sourceUrl: "https://example.org/pricing",
        verified: true,
      },
    });

    authState.user = user;
    const response = await getToday();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.plan).toEqual({ name: "FREE", premium: false });
    expect(body.renewals).toHaveLength(10);
    expect(body.news).toEqual([expect.objectContaining({ id: news.id, service: { id: service.id, name: service.name } })]);
    expect(body.news.some((item: { id: string }) => item.id === foreignNews.id)).toBe(false);
    expect(body.priceChanges).toEqual([expect.objectContaining({ service: { id: service.id, name: service.name } })]);
    expect(body.actions).toEqual(expect.arrayContaining([expect.objectContaining({ type: "PRICE_CHANGE_REVIEW", subscriptionName: service.name })]));
  });
});
