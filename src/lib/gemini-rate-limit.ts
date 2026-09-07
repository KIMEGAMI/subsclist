import {
  GEMINI_DAILY_REQUEST_LIMIT,
  GEMINI_REQUEST_RETENTION_DAYS,
} from "@/lib/app-constants";
import { evaluateGeminiRateLimit } from "@/lib/gemini-rate-limit-policy";
import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1_000;

export async function claimGeminiAnalysisRequest(userId: string, now = new Date()) {
  const dayStart = new Date(now.getTime() - DAY_MS);
  const decision = await prisma.$transaction(async (transaction) => {
    const recent = await transaction.geminiAnalysisRequest.findMany({
      where: { userId, createdAt: { gt: dayStart } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
      take: GEMINI_DAILY_REQUEST_LIMIT,
    });
    const evaluated = evaluateGeminiRateLimit(
      recent.map((item) => item.createdAt),
      now,
    );
    if (!evaluated.allowed) return evaluated;

    await transaction.geminiAnalysisRequest.create({
      data: { userId, createdAt: now },
    });
    return evaluated;
  });

  const retentionStart = new Date(
    now.getTime() - GEMINI_REQUEST_RETENTION_DAYS * DAY_MS,
  );
  await prisma.geminiAnalysisRequest.deleteMany({
    where: { userId, createdAt: { lt: retentionStart } },
  });

  return decision;
}
