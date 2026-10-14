import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers } from "../helpers/database";

const syncMock = vi.hoisted(() => vi.fn(async () => ({ imported: 2, failedServices: [] as string[] })));
vi.mock("@/lib/official-news-sync", () => ({ syncOfficialNewsFeeds: syncMock }));

import { runDailyNewsJob } from "@/lib/daily-news";

const createdUserIds: string[] = [];

afterEach(async () => {
  syncMock.mockClear();
  await prisma.newsGenerationRun.deleteMany({ where: { dayKey: { gte: new Date("2030-01-01T00:00:00.000Z") } } });
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("毎朝の公式ニュース", () => {
  it("公式情報の同期を1日1回だけ実行する", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    const scheduledAt = new Date("2030-06-01T20:00:00.000Z");
    const first = await runDailyNewsJob(scheduledAt);
    expect(first).toMatchObject({ skipped: false, officialImported: 2, generatedArticles: 0, failedArticleCount: 0, geminiQuotaLimited: false, runDate: "2030-06-02" });
    expect(syncMock).toHaveBeenCalledTimes(1);
    const second = await runDailyNewsJob(scheduledAt);
    expect(second.skipped).toBe(true);
    expect(syncMock).toHaveBeenCalledTimes(1);
  });

  it("利用者やGemini設定がなくても公式ニュース同期を実行できる", async () => {
    const result = await runDailyNewsJob(new Date("2030-06-02T20:00:00.000Z"));
    expect(result).toMatchObject({ skipped: false, officialImported: 2, generatedArticles: 0, geminiQuotaLimited: false });
    expect(syncMock).toHaveBeenCalledTimes(1);
  });

  it("失敗理由を実行履歴へ保存し、再実行時に消去する", async () => {
    syncMock.mockRejectedValueOnce(new Error("情報源への接続に失敗しました。"));
    await expect(runDailyNewsJob(new Date("2030-06-03T20:00:00.000Z"))).rejects.toThrow("公式ニュースの更新に失敗しました。");
    const failed = await prisma.newsGenerationRun.findUniqueOrThrow({ where: { dayKey: new Date("2030-06-04T00:00:00.000Z") } });
    expect(failed.status).toBe("FAILED");
    expect(failed.lastError).toBe("情報源への接続に失敗しました。");

    syncMock.mockResolvedValueOnce({ imported: 1, failedServices: [] });
    const retried = await runDailyNewsJob(new Date("2030-06-03T20:00:00.000Z"));
    expect(retried.skipped).toBe(false);
    expect((await prisma.newsGenerationRun.findUniqueOrThrow({ where: { dayKey: new Date("2030-06-04T00:00:00.000Z") } })).lastError).toBeNull();
  });
});
