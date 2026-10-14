import { DAILY_NEWS_ARTICLE_RETENTION_DAYS } from "@/lib/app-constants";
import { syncOfficialNewsFeeds } from "@/lib/official-news-sync";
import { prisma } from "@/lib/prisma";

const japanTimeZone = "Asia/Tokyo";

export type DailyNewsJobResult = {
  skipped: boolean;
  officialImported: number;
  generatedArticles: number;
  failedArticleCount: number;
  geminiQuotaLimited: boolean;
  runDate: string;
};

function safeJobError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 500);
  }
  return "公式ニュースの取得中に不明なエラーが発生しました。";
}

function japanDateText(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: japanTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

function dateKey(now: Date) {
  return new Date(`${japanDateText(now)}T00:00:00.000Z`);
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

async function claimDailyRun(dayKey: Date) {
  const existing = await prisma.newsGenerationRun.findUnique({ where: { dayKey } });
  if (existing?.status === "COMPLETED" || existing?.status === "RUNNING") return false;
  if (existing?.status === "FAILED" || existing?.status === "PARTIAL") {
    const restarted = await prisma.newsGenerationRun.updateMany({ where: { id: existing.id, status: { in: ["FAILED", "PARTIAL"] } }, data: { status: "RUNNING", officialImported: 0, generatedArticles: 0, failedArticleCount: 0, lastError: null } });
    return restarted.count === 1;
  }
  try {
    await prisma.newsGenerationRun.create({ data: { dayKey, status: "RUNNING" } });
    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) return false;
    throw error;
  }
}

export async function runDailyNewsJob(now = new Date()): Promise<DailyNewsJobResult> {
  const runDate = japanDateText(now);
  const dayKey = dateKey(now);
  if (!(await claimDailyRun(dayKey))) {
    const previous = await prisma.newsGenerationRun.findUnique({ where: { dayKey } });
    return { skipped: true, officialImported: previous?.officialImported ?? 0, generatedArticles: previous?.generatedArticles ?? 0, failedArticleCount: previous?.failedArticleCount ?? 0, geminiQuotaLimited: false, runDate };
  }
  let officialImported = 0;
  let failedArticleCount = 0;
  try {
    const result = await syncOfficialNewsFeeds();
    officialImported = result.imported;
    failedArticleCount = result.failedServices.length;
    await prisma.newsItem.deleteMany({ where: { sourceType: "OFFICIAL_RSS", fetchedAt: { lt: new Date(now.getTime() - DAILY_NEWS_ARTICLE_RETENTION_DAYS * 24 * 60 * 60 * 1_000) } } });
    const status = failedArticleCount > 0 ? "PARTIAL" : "COMPLETED";
    await prisma.newsGenerationRun.update({ where: { dayKey }, data: { status, officialImported, generatedArticles: 0, failedArticleCount, lastError: failedArticleCount > 0 ? `${result.failedServices.length}件の情報源で取得に失敗しました。` : null } });
    return { skipped: false, officialImported, generatedArticles: 0, failedArticleCount, geminiQuotaLimited: false, runDate };
  } catch (error) {
    await prisma.newsGenerationRun.update({ where: { dayKey }, data: { status: "FAILED", officialImported, generatedArticles: 0, failedArticleCount: failedArticleCount + 1, lastError: safeJobError(error) } });
    throw new Error("公式ニュースの更新に失敗しました。");
  }
}
