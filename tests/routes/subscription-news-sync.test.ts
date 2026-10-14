import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
const syncMock = vi.hoisted(() => {
  class BusyError extends Error {}
  return { run: vi.fn(async () => ({ imported: 1, failedServices: [] as string[] })), BusyError };
});
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: new Response(null, { status: 401 }) },
}));
vi.mock("@/lib/official-news-sync", () => ({ syncOfficialNewsFeeds: syncMock.run, OfficialNewsSyncBusyError: syncMock.BusyError }));

import { POST } from "@/app/api/subscription-news/sync/route";

const userIds: string[] = [];
const serviceIds: string[] = [];

afterEach(async () => {
  authState.user = null;
  syncMock.run.mockClear();
  await prisma.serviceMaster.deleteMany({ where: { id: { in: serviceIds.splice(0) } } });
  await deleteTestUsers(...userIds.splice(0));
});

describe("契約ニュースの手動同期", () => {
  it("本人の有効な契約だけを同期し、Watch登録だけのサービスを含めない", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    const contracted = await prisma.serviceMaster.create({ data: { slug: uniqueLabel("news-sync-contracted"), name: uniqueLabel("NewsContracted"), category: "AI", officialUrl: "https://example.org", status: "ACTIVE" } });
    const watched = await prisma.serviceMaster.create({ data: { slug: uniqueLabel("news-sync-watched"), name: uniqueLabel("NewsWatched"), category: "AI", officialUrl: "https://example.net", status: "ACTIVE" } });
    serviceIds.push(contracted.id, watched.id);
    await prisma.subscription.create({ data: { userId: user.id, serviceMasterId: contracted.id, name: contracted.name, price: 1000, billingCycle: "MONTHLY", nextBillingDate: new Date("2031-01-01T00:00:00.000Z") } });
    await prisma.serviceWatchlist.create({ data: { userId: user.id, serviceId: watched.id, watchNews: true } });
    authState.user = user;

    const response = await POST();

    expect(response.status).toBe(200);
    expect(syncMock.run).toHaveBeenCalledWith({ serviceIds: [contracted.id] });
  });

  it("別の同期が実行中なら再取得を開始せず409を返す", async () => {
    const user = await createTestUser();
    userIds.push(user.id);
    authState.user = user;
    syncMock.run.mockRejectedValueOnce(new syncMock.BusyError("busy"));

    const response = await POST();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: "ニュースを更新中です。少し待ってからもう一度お試しください。" });
  });
});
