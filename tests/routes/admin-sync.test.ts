import { afterEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ admin: false, newsSecret: "route-test-secret-with-at-least-32-characters" }));
const mocks = vi.hoisted(() => ({
  news: vi.fn(async () => ({ imported: 1, failedServices: [] as string[] })),
  prices: vi.fn(async () => ({ imported: 1, changed: 0, failedServices: [] as string[] })),
  BusyError: class BusyError extends Error {},
}));

vi.mock("@/lib/api-auth", () => ({
  getAdminApiUser: async () => authState.admin
    ? { ok: true as const, user: { id: "admin-test", email: "admin@test.invalid" } }
    : { ok: false as const, response: new Response(null, { status: 403 }) },
}));
vi.mock("@/lib/env", () => ({ env: { get newsJobSecret() { return authState.newsSecret; }, appUrl: "http://127.0.0.1:3100" } }));
vi.mock("@/lib/official-news-sync", () => ({ syncOfficialNewsFeeds: mocks.news, OfficialNewsSyncBusyError: mocks.BusyError }));
vi.mock("@/lib/service-price", () => ({ syncOfficialServicePrices: mocks.prices }));

import { POST as runDaily } from "@/app/api/admin/news/daily/route";
import { POST as syncNews } from "@/app/api/admin/news/sync/route";
import { POST as syncPrices } from "@/app/api/admin/prices/sync/route";

afterEach(() => {
  authState.admin = false;
  authState.newsSecret = "route-test-secret-with-at-least-32-characters";
  vi.clearAllMocks();
});

describe("管理者同期API", () => {
  it("未認証の同期要求を拒否する", async () => {
    expect((await runDaily(new Request("http://127.0.0.1:3100/api/admin/news/daily", { method: "POST" }))).status).toBe(403);
    expect((await syncNews(new Request("http://127.0.0.1:3100/api/admin/news/sync", { method: "POST" }))).status).toBe(403);
    expect((await syncPrices(new Request("http://127.0.0.1:3100/api/admin/prices/sync", { method: "POST" }))).status).toBe(403);
    expect(mocks.news).not.toHaveBeenCalled();
    expect(mocks.prices).not.toHaveBeenCalled();
  });

  it("ジョブ秘密鍵ではニュースを同期せず、管理者の手動操作を許可する", async () => {
    const secret = authState.newsSecret;
    const authRequest = (path: string) => new Request(`http://127.0.0.1:3100${path}`, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
    expect((await runDaily(authRequest("/api/admin/news/daily"))).status).toBe(403);
    expect((await syncNews(authRequest("/api/admin/news/sync"))).status).toBe(403);
    expect((await syncPrices(authRequest("/api/admin/prices/sync"))).status).toBe(200);
    expect(mocks.news).not.toHaveBeenCalled();
    expect(mocks.prices).toHaveBeenCalledTimes(1);

    authState.admin = true;
    const trustedAdminRequest = (path: string) => new Request(`http://127.0.0.1:3100${path}`, {
      method: "POST",
      headers: { origin: "http://127.0.0.1:3100" },
    });
    expect((await runDaily(new Request("http://127.0.0.1:3100/api/admin/news/daily", { method: "POST" }))).status).toBe(200);
    expect((await syncNews(new Request("http://127.0.0.1:3100/api/admin/news/sync", { method: "POST" }))).status).toBe(200);
    expect((await syncPrices(new Request("http://127.0.0.1:3100/api/admin/prices/sync", { method: "POST" }))).status).toBe(403);
    expect((await syncPrices(trustedAdminRequest("/api/admin/prices/sync"))).status).toBe(200);
    expect(mocks.news).toHaveBeenCalledTimes(2);
    expect(mocks.prices).toHaveBeenCalledTimes(2);
  });

  it("短いジョブ秘密鍵では一致するBearerでも同期を拒否する", async () => {
    authState.newsSecret = "short-job-secret";
    const response = await syncPrices(new Request("http://127.0.0.1:3100/api/admin/prices/sync", {
      method: "POST",
      headers: { authorization: "Bearer short-job-secret" },
    }));

    expect(response.status).toBe(403);
    expect(mocks.prices).not.toHaveBeenCalled();
  });

  it("管理者同期APIは別のニュース同期が実行中なら409を返す", async () => {
    authState.admin = true;
    mocks.news.mockRejectedValueOnce(new mocks.BusyError("busy"));

    const response = await syncNews(new Request("http://127.0.0.1:3100/api/admin/news/sync", { method: "POST" }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: "ニュースを更新中です。少し待ってからもう一度お試しください。" });

    mocks.news.mockRejectedValueOnce(new mocks.BusyError("busy"));
    const dailyResponse = await runDaily(new Request("http://127.0.0.1:3100/api/admin/news/daily", { method: "POST" }));
    expect(dailyResponse.status).toBe(409);
  });
});
