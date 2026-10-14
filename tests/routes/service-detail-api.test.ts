import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
vi.mock("@/lib/auth", () => ({
  requireVerifiedUser: async () => {
    if (!authState.user) throw new Error("テストユーザーが未設定です。");
    return authState.user;
  },
  getCurrentUser: async () => authState.user,
  isAdminEmail: () => false,
  getMaintenanceMode: async () => false,
}));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: new Response(null, { status: 401 }) },
}));

import { GET as getPrices } from "@/app/api/services/[id]/prices/route";
import { GET as getNews } from "@/app/api/services/[id]/news/route";
import { GET as getAlternatives } from "@/app/api/services/[id]/alternatives/route";
import { GET as searchServices } from "@/app/api/services/route";
import { GET as getPersonalNews } from "@/app/api/news/route";
import { POST as recordNewsView } from "@/app/api/subscription-news/[id]/view/route";
import { GET as getReviewScore } from "@/app/api/subscriptions/[id]/review-score/route";
import { PUT as saveDecisionBySubscription } from "@/app/api/subscriptions/[id]/renewal-decision/route";
import { POST as recordUsage } from "@/app/api/subscriptions/[id]/usage/route";
import { GET as getSavings } from "@/app/api/savings/route";
import { PUT as linkServiceMaster } from "@/app/api/subscriptions/[id]/service-master/route";

const userIds: string[] = [];
const serviceIds: string[] = [];
const newsIds: string[] = [];

afterEach(async () => {
  authState.user = null;
  await prisma.newsItem.deleteMany({ where: { id: { in: newsIds.splice(0) } } });
  await prisma.serviceMaster.deleteMany({ where: { id: { in: serviceIds.splice(0) } } });
  await deleteTestUsers(...userIds.splice(0));
});

describe("サービス詳細API", () => {
  it("未認証のサービスAPIはリダイレクトせず401を返す", async () => {
    expect((await searchServices(new Request("http://127.0.0.1:3100/api/services?q=test"))).status).toBe(401);
    expect((await getPersonalNews(new Request("http://127.0.0.1:3100/api/news"))).status).toBe(401);
  });

  it("価格APIは公式Snapshotだけを返す", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const service = await prisma.serviceMaster.create({ data: { slug: uniqueLabel("price-api"), name: "価格APIサービス", category: "AI", officialUrl: "https://example.org", status: "ACTIVE" } });
    serviceIds.push(service.id);
    await prisma.servicePriceSnapshot.createMany({ data: [
      { serviceId: service.id, planName: "Pro", billingCycle: "MONTHLY", currency: "JPY", amount: 980, sourceUrl: "https://example.org/pricing", trustLevel: "OFFICIAL" },
      { serviceId: service.id, planName: "推測", billingCycle: "MONTHLY", currency: "JPY", amount: 999, sourceUrl: "https://example.org/pricing", trustLevel: "UNKNOWN" },
    ] });
    authState.user = user;
    const response = await getPrices(new Request("http://127.0.0.1:3100"), { params: Promise.resolve({ id: service.id }) });
    expect(response.status).toBe(200);
    expect((await response.json()).snapshots).toHaveLength(1);
  });

  it("ニュースAPIは公式ニュースだけを返す", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const service = await prisma.serviceMaster.create({ data: { slug: uniqueLabel("news-api"), name: "ニュースAPIサービス", category: "AI", officialUrl: "https://example.org", status: "ACTIVE" } });
    serviceIds.push(service.id);
    const official = await prisma.newsItem.create({ data: { serviceId: service.id, title: "公式更新", sourceName: "公式", sourceUrl: "https://example.org/news", sourceType: "OFFICIAL_RSS", category: "MAJOR_UPDATE", trustLevel: "OFFICIAL", contentHash: uniqueLabel("official") } });
    const unverified = await prisma.newsItem.create({ data: { serviceId: service.id, title: "未確認", sourceName: "不明", sourceUrl: "https://example.org/unknown", sourceType: "GEMINI_SEARCH", category: "GENERAL", trustLevel: "UNKNOWN", contentHash: uniqueLabel("unknown") } });
    newsIds.push(official.id, unverified.id);
    authState.user = user;
    const response = await getNews(new Request("http://127.0.0.1:3100"), { params: Promise.resolve({ id: service.id }) });
    expect(response.status).toBe(200);
    expect((await response.json()).news.map((item: { id: string }) => item.id)).toEqual([official.id]);
  });

  it("存在しないサービスは404を返す", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    authState.user = user;
    const response = await getAlternatives(new Request("http://127.0.0.1:3100"), { params: Promise.resolve({ id: "missing-service" }) });
    expect(response.status).toBe(404);
  });

  it("代替候補APIは公式価格だけを含め、ID形式も検証する", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const service = await prisma.serviceMaster.create({ data: { slug: uniqueLabel("alternatives-source"), name: "比較元サービス", category: "AI", officialUrl: "https://example.org", status: "ACTIVE" } });
    const alternative = await prisma.serviceMaster.create({ data: { slug: uniqueLabel("alternatives-target"), name: "代替サービス", category: "AI", officialUrl: "https://example.net", status: "ACTIVE" } });
    serviceIds.push(service.id, alternative.id);
    await prisma.serviceAlternative.create({ data: { serviceId: service.id, alternativeServiceId: alternative.id, categoryMatch: 90, featureSimilarity: 80, note: "同じ用途で比較できます。" } });
    await prisma.servicePriceSnapshot.createMany({ data: [
      { serviceId: alternative.id, planName: "公式プラン", billingCycle: "MONTHLY", currency: "JPY", amount: 980, sourceUrl: "https://example.net/pricing", trustLevel: "OFFICIAL" },
      { serviceId: alternative.id, planName: "未確認プラン", billingCycle: "MONTHLY", currency: "JPY", amount: 1_280, sourceUrl: "https://example.net/pricing", trustLevel: "UNKNOWN" },
    ] });
    authState.user = user;
    const response = await getAlternatives(new Request("http://127.0.0.1:3100"), { params: Promise.resolve({ id: service.id }) });
    expect(response.status).toBe(200);
    expect((await response.json()).alternatives).toEqual([expect.objectContaining({ service: expect.objectContaining({ id: alternative.id, priceSnapshots: [expect.objectContaining({ amount: 980 })] }) })]);
    expect((await getAlternatives(new Request("http://127.0.0.1:3100"), { params: Promise.resolve({ id: "../unsafe" }) })).status).toBe(400);
  });

  it("サービス検索は一致したサービスとWatch状態だけを返す", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const watched = await prisma.serviceMaster.create({ data: { slug: uniqueLabel("search-watched"), name: "検索対象サービス", category: "AI", officialUrl: "https://example.org", status: "ACTIVE" } });
    const other = await prisma.serviceMaster.create({ data: { slug: uniqueLabel("search-other"), name: "別サービス", category: "音楽", officialUrl: "https://example.org", status: "ACTIVE" } });
    serviceIds.push(watched.id, other.id);
    await prisma.serviceWatchlist.create({ data: { userId: user.id, serviceId: watched.id } });
    authState.user = user;
    const response = await searchServices(new Request("http://127.0.0.1:3100/api/services?q=検索対象"));
    expect(response.status).toBe(200);
    expect((await response.json()).services).toEqual([expect.objectContaining({ id: watched.id, watching: true })]);
  });

  it("ニュースAPIは契約中サービスの記事だけを返し、Feedbackを添付する", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const service = await prisma.serviceMaster.create({ data: { slug: uniqueLabel("personal-news"), name: "契約ニュースサービス", category: "AI", officialUrl: "https://example.org", status: "ACTIVE" } });
    const unrelated = await prisma.serviceMaster.create({ data: { slug: uniqueLabel("unrelated-news"), name: "無関係サービス", category: "AI", officialUrl: "https://example.org", status: "ACTIVE" } });
    serviceIds.push(service.id, unrelated.id);
    await prisma.serviceWatchlist.create({ data: { userId: user.id, serviceId: unrelated.id, watchNews: true } });
    await prisma.subscription.create({ data: { userId: user.id, serviceMasterId: service.id, name: service.name, price: 980, billingCycle: "MONTHLY", nextBillingDate: new Date("2031-01-01T00:00:00.000Z") } });
    const news = await prisma.newsItem.create({ data: { serviceId: service.id, title: "契約者向け更新", sourceName: "公式", sourceUrl: "https://example.org/news", sourceType: "OFFICIAL_RSS", category: "PRICE_CHANGE", trustLevel: "OFFICIAL", contentHash: uniqueLabel("personal-news") } });
    await prisma.newsItem.create({ data: { serviceId: unrelated.id, title: "無関係更新", sourceName: "公式", sourceUrl: "https://example.org/other", sourceType: "OFFICIAL_RSS", category: "MAJOR_UPDATE", trustLevel: "OFFICIAL", contentHash: uniqueLabel("unrelated-news") } });
    newsIds.push(news.id);
    await prisma.userNewsFeedback.create({ data: { userId: user.id, newsItemId: news.id, feedback: "USEFUL" } });
    authState.user = user;
    const response = await getPersonalNews(new Request("http://127.0.0.1:3100/api/news?limit=10"));
    expect(response.status).toBe(200);
    expect((await response.json()).news).toEqual([expect.objectContaining({ id: news.id, feedback: { feedback: "USEFUL", clickedAt: null } })]);
  });

  it("契約とサービスの紐付けは本人の契約だけを更新し、空値で解除できる", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    userIds.push(owner.id, other.id);
    const service = await prisma.serviceMaster.create({ data: { slug: uniqueLabel("link-service"), name: "紐付けサービス", category: "AI", officialUrl: "https://example.org", status: "ACTIVE" } });
    serviceIds.push(service.id);
    const subscription = await prisma.subscription.create({ data: { userId: owner.id, name: "紐付け契約", price: 980, billingCycle: "MONTHLY", nextBillingDate: new Date("2031-01-01T00:00:00.000Z") } });
    const request = (body: unknown) => new Request("http://127.0.0.1:3100", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    authState.user = owner;
    expect((await linkServiceMaster(request({ serviceId: service.id }), { params: Promise.resolve({ id: subscription.id }) })).status).toBe(200);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } })).serviceMasterId).toBe(service.id);
    expect((await linkServiceMaster(request({ serviceId: "" }), { params: Promise.resolve({ id: subscription.id }) })).status).toBe(200);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } })).serviceMasterId).toBeNull();
    authState.user = other;
    expect((await linkServiceMaster(request({ serviceId: service.id }), { params: Promise.resolve({ id: subscription.id }) })).status).toBe(404);
    authState.user = owner;
    expect((await linkServiceMaster(request({ serviceId: "unsafe id" }), { params: Promise.resolve({ id: subscription.id }) })).status).toBe(400);
  });

  it("記事を開くと本人の閲覧時刻だけを保存する", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    userIds.push(owner.id, other.id);
    const service = await prisma.serviceMaster.create({ data: { slug: uniqueLabel("view-news"), name: "閲覧記録サービス", category: "AI", officialUrl: "https://example.org", status: "ACTIVE" } });
    serviceIds.push(service.id);
    await prisma.subscription.create({ data: { userId: owner.id, serviceMasterId: service.id, name: service.name, price: 980, billingCycle: "MONTHLY", nextBillingDate: new Date("2031-01-01T00:00:00.000Z") } });
    const news = await prisma.newsItem.create({ data: { serviceId: service.id, title: "閲覧記録対象", sourceName: "日本語ニュース", sourceUrl: "https://example.org/news", sourceType: "JAPAN_NEWS_RSS", category: "GENERAL", trustLevel: "VERIFIED", contentHash: uniqueLabel("view-news") } });
    newsIds.push(news.id);
    await prisma.serviceWatchlist.create({ data: { userId: other.id, serviceId: service.id, watchNews: true } });
    authState.user = owner;
    expect((await recordNewsView(new Request("http://127.0.0.1:3100"), { params: Promise.resolve({ id: news.id }) })).status).toBe(200);
    expect(await prisma.userNewsFeedback.findUnique({ where: { userId_newsItemId: { userId: owner.id, newsItemId: news.id } } })).toMatchObject({ feedback: "VIEWED", clickedAt: expect.any(Date) });
    authState.user = other;
    expect((await recordNewsView(new Request("http://127.0.0.1:3100"), { params: Promise.resolve({ id: news.id }) })).status).toBe(404);
  });

  it("見直しスコアは所有者の契約データだけで計算する", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    userIds.push(owner.id, other.id);
    const service = await prisma.serviceMaster.create({ data: { slug: uniqueLabel("score-api"), name: "スコアサービス", category: "AI", officialUrl: "https://example.org", status: "ACTIVE" } });
    serviceIds.push(service.id);
    const subscription = await prisma.subscription.create({ data: { userId: owner.id, serviceMasterId: service.id, name: service.name, price: 2_000, billingCycle: "MONTHLY", nextBillingDate: new Date("2031-01-01T00:00:00.000Z"), priority: "OPTIONAL", usageFrequency: "RARELY" } });
    await prisma.subscriptionUsage.create({ data: { userId: owner.id, subscriptionId: subscription.id, usedDate: new Date("2025-01-01T00:00:00.000Z"), usageCount: 1 } });
    await prisma.servicePriceChange.create({ data: { serviceId: service.id, planName: "Pro", oldAmount: 1_500, newAmount: 2_000, changeAmount: 500, currency: "JPY", sourceUrl: "https://example.org/pricing", verified: true } });
    authState.user = owner;
    const response = await getReviewScore(new Request("http://127.0.0.1:3100"), { params: Promise.resolve({ id: subscription.id }) });
    expect(response.status).toBe(200);
    expect((await response.json()).reasons).toEqual(expect.arrayContaining(["公式価格が上昇しています", "30日以上利用記録がありません"]));
    authState.user = other;
    expect((await getReviewScore(new Request("http://127.0.0.1:3100"), { params: Promise.resolve({ id: subscription.id }) })).status).toBe(404);
  });

  it("契約別更新判断APIは既存のPremium制限と履歴保存を再利用する", async () => {
    const owner = await createTestUser({ plan: "PREMIUM" });
    const free = await createTestUser({ plan: "FREE" });
    userIds.push(owner.id, free.id);
    const subscription = await prisma.subscription.create({ data: { userId: owner.id, name: "判断対象", price: 980, billingCycle: "MONTHLY", nextBillingDate: new Date("2031-01-01T00:00:00.000Z") } });
    const request = () => new Request("http://127.0.0.1:3100", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "HOLD", reason: "来月に再確認" }) });
    authState.user = owner;
    expect((await saveDecisionBySubscription(request(), { params: Promise.resolve({ id: subscription.id }) })).status).toBe(200);
    expect(await prisma.savingChallenge.findFirst({ where: { userId: owner.id, subscriptionId: subscription.id } })).toMatchObject({ status: "HOLD", reason: "来月に再確認" });
    authState.user = free;
    expect((await saveDecisionBySubscription(request(), { params: Promise.resolve({ id: subscription.id }) })).status).toBe(403);
  });

  it("汎用利用記録APIは同日回数を加算し、未来日と他ユーザーを拒否する", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    userIds.push(owner.id, other.id);
    const subscription = await prisma.subscription.create({ data: { userId: owner.id, name: "利用記録対象", price: 980, billingCycle: "MONTHLY", nextBillingDate: new Date("2031-01-01T00:00:00.000Z") } });
    const request = (usedDate: string) => new Request("http://127.0.0.1:3100", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usedDate }) });
    authState.user = owner;
    expect((await recordUsage(request("2026-09-19"), { params: Promise.resolve({ id: subscription.id }) })).status).toBe(200);
    expect((await recordUsage(request("2026-09-19"), { params: Promise.resolve({ id: subscription.id }) })).status).toBe(200);
    expect(await prisma.subscriptionUsage.findUnique({ where: { userId_subscriptionId_usedDate: { userId: owner.id, subscriptionId: subscription.id, usedDate: new Date("2026-09-19T00:00:00.000Z") } } })).toMatchObject({ usageCount: 2 });
    expect((await recordUsage(request("2099-01-01"), { params: Promise.resolve({ id: subscription.id }) })).status).toBe(400);
    authState.user = other;
    expect((await recordUsage(request("2026-09-19"), { params: Promise.resolve({ id: subscription.id }) })).status).toBe(404);
  });

  it("Savings APIは本人の確定イベントだけを集計する", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    userIds.push(owner.id, other.id);
    const subscription = await prisma.subscription.create({ data: { userId: owner.id, name: "節約集計対象", price: 2_000, billingCycle: "MONTHLY", nextBillingDate: new Date("2031-01-01T00:00:00.000Z") } });
    await prisma.savingsEvent.create({ data: { userId: owner.id, subscriptionId: subscription.id, type: "CANCELLED", beforeMonthlyAmount: 2_000, afterMonthlyAmount: 0, monthlySaving: 2_000, annualSaving: 24_000, dedupeKey: uniqueLabel("saving-owner"), confirmedAt: new Date() } });
    await prisma.savingsEvent.create({ data: { userId: other.id, subscriptionId: subscription.id, type: "CANCELLED", beforeMonthlyAmount: 2_000, afterMonthlyAmount: 0, monthlySaving: 99_000, annualSaving: 1_188_000, dedupeKey: uniqueLabel("saving-other"), confirmedAt: new Date() } });
    authState.user = owner;
    const response = await getSavings();
    expect(response.status).toBe(200);
    expect((await response.json()).summary.lifetimeSaving).toBe(2_000);
  });
});
