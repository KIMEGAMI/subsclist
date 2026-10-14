import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));

import { POST } from "@/app/api/subscription-news/[id]/feedback/route";
import { POST as recordNewsView } from "@/app/api/subscription-news/[id]/view/route";

const createdUserIds: string[] = [];
const createdNewsIds: string[] = [];
const createdServiceIds: string[] = [];

function request(feedback: string) {
  return new Request("http://127.0.0.1:3100/api/subscription-news/news/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ feedback }) });
}

async function setup() {
  const owner = await createTestUser();
  const other = await createTestUser();
  createdUserIds.push(owner.id, other.id);
  const service = await prisma.serviceMaster.create({ data: { slug: uniqueLabel("feedback-service"), name: uniqueLabel("FeedbackService"), category: "AI", officialUrl: "https://example.org", status: "ACTIVE" } });
  createdServiceIds.push(service.id);
  await prisma.subscription.create({ data: { userId: owner.id, serviceMasterId: service.id, name: service.name, price: 1000, billingCycle: "MONTHLY", nextBillingDate: new Date("2031-01-01T00:00:00.000Z") } });
  await prisma.serviceWatchlist.create({ data: { userId: other.id, serviceId: service.id, watchNews: true } });
  const news = await prisma.newsItem.create({ data: { serviceId: service.id, title: "日本語ニュース更新", summaryBase: "更新概要", sourceUrl: "https://example.org/news", sourceName: service.name, sourceType: "JAPAN_NEWS_RSS", category: "更新", trustLevel: "VERIFIED", contentHash: uniqueLabel("feedback-hash") } });
  createdNewsIds.push(news.id);
  return { owner, other, news };
}

afterEach(async () => {
  authState.user = null;
  await prisma.newsItem.deleteMany({ where: { id: { in: createdNewsIds.splice(0) } } });
  await prisma.serviceMaster.deleteMany({ where: { id: { in: createdServiceIds.splice(0) } } });
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("ニュースFeedback", () => {
  it("対象サービスの契約者だけがFeedbackを保存できる", async () => {
    const { owner, other, news } = await setup();
    authState.user = owner;
    expect((await POST(request("USEFUL"), { params: Promise.resolve({ id: news.id }) })).status).toBe(200);
    expect(await prisma.userNewsFeedback.findUnique({ where: { userId_newsItemId: { userId: owner.id, newsItemId: news.id } } })).toMatchObject({ feedback: "USEFUL" });
    for (let count = 0; count < 29; count += 1) expect((await POST(request("USEFUL"), { params: Promise.resolve({ id: news.id }) })).status).toBe(200);
    const limited = await POST(request("USEFUL"), { params: Promise.resolve({ id: news.id }) });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    authState.user = other;
    expect((await POST(request("NOT_INTERESTED"), { params: Promise.resolve({ id: news.id }) })).status).toBe(404);
    expect((await recordNewsView(new Request("http://127.0.0.1:3100"), { params: Promise.resolve({ id: news.id }) })).status).toBe(404);
  });
});
