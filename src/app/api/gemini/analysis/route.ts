import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { GEMINI_MAX_SUBSCRIPTIONS } from "@/lib/app-constants";
import { monthlyAmount, nextBillingOccurrence } from "@/lib/billing";
import { assertGeminiEnv, env } from "@/lib/env";
import {
  GeminiAnalysisError,
  generateGeminiAnalysis,
  type GeminiSubscriptionInput,
} from "@/lib/gemini-analysis";
import { claimGeminiAnalysisRequest } from "@/lib/gemini-rate-limit";
import { isPremiumPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";

const requestSchema = z.object({ consent: z.literal(true) });

export async function POST(request: Request) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  if (!isPremiumPlan(access.user.plan)) {
    return NextResponse.json(
      { message: "Gemini比較分析はPremium限定です。" },
      { status: 403 },
    );
  }

  const parsed = requestSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "外部AIへのデータ送信に同意してください。" },
      { status: 400 },
    );
  }

  try {
    assertGeminiEnv();
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Gemini APIの設定を確認してください。",
      },
      { status: 503 },
    );
  }

  const records = await prisma.subscription.findMany({
    where: { userId: access.user.id, deletedAt: null, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      price: true,
      billingCycle: true,
      customCycleDays: true,
      nextBillingDate: true,
      lastReviewedAt: true,
      usageFrequency: true,
      priority: true,
      category: { select: { name: true } },
    },
  });
  const subscriptions: GeminiSubscriptionInput[] = records
    .map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category?.name ?? "未分類",
      monthlyPrice: Math.round(
        monthlyAmount(item.price, item.billingCycle, item.customCycleDays),
      ),
      usageFrequency: item.usageFrequency,
      priority: item.priority,
      nextBillingDate: nextBillingOccurrence(
        item.nextBillingDate,
        item.billingCycle,
        item.customCycleDays,
      ).toISOString().slice(0, 10),
      lastReviewedAt:
        item.lastReviewedAt?.toISOString().slice(0, 10) ?? null,
    }))
    .sort((a, b) => b.monthlyPrice - a.monthlyPrice)
    .slice(0, GEMINI_MAX_SUBSCRIPTIONS);

  if (subscriptions.length === 0) {
    return NextResponse.json(
      { message: "分析対象の有効な契約がありません。" },
      { status: 400 },
    );
  }

  const rateLimit = await claimGeminiAnalysisRequest(access.user.id);
  if (!rateLimit.allowed) {
    const retryAfter = Math.max(
      1,
      Math.ceil((rateLimit.retryAt.getTime() - Date.now()) / 1_000),
    );
    return NextResponse.json(
      { message: "Gemini比較分析の利用上限に達しました。時間をおいて再度お試しください。" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  try {
    const analysis = await generateGeminiAnalysis({
      apiKey: env.geminiApiKey,
      model: env.geminiModel,
      subscriptions,
    });
    return NextResponse.json({
      analysis,
      model: env.geminiModel,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof GeminiAnalysisError
        ? error.message
        : "Gemini比較分析を生成できませんでした。時間をおいて再度お試しください。";
    return NextResponse.json({ message }, { status: 502 });
  }
}
