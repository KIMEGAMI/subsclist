import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVerifiedUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const requestSchema = z.object({ subscriptionId: z.string().min(1) });

type RelatedSubscriptionForRecommendation = {
  name: string;
  price: number;
  billingCycle: string;
  customCycleDays: number | null;
  category: { name: string } | null;
};

function monthly(price: number, cycle: string, customCycleDays?: number | null) {
  if (cycle === "YEARLY") return price / 12;
  if (cycle === "WEEKLY") return price * 4.345;
  if (cycle === "CUSTOM") return customCycleDays ? price * (30.437 / customCycleDays) : price;
  return price;
}

function outputText(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const direct = (data as { output_text?: unknown }).output_text;
  if (typeof direct === "string") return direct;
  const output = (data as { output?: Array<{ content?: Array<{ text?: string }> }> }).output;
  return output?.flatMap((item) => item.content ?? []).map((content) => content.text ?? "").join("") ?? "";
}

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "recommendations", "notes"],
  properties: {
    summary: { type: "string" },
    notes: { type: "array", items: { type: "string" } },
    recommendations: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["currentService", "category", "priority", "reason", "recommendedAction", "alternatives", "expectedMonthlyImpact", "risk"],
        properties: {
          currentService: { type: "string" },
          category: { type: "string" },
          priority: { type: "string", enum: ["高", "中", "低"] },
          reason: { type: "string" },
          recommendedAction: { type: "string" },
          expectedMonthlyImpact: { type: "string" },
          risk: { type: "string" },
          alternatives: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "why", "estimatedPrice", "officialUrl"],
              properties: {
                name: { type: "string" },
                why: { type: "string" },
                estimatedPrice: { type: "string" },
                officialUrl: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
};

export async function POST(request: Request) {
  const user = await requireVerifiedUser();
  if (!env.openaiApiKey) {
    return NextResponse.json({ message: "OPENAI_API_KEY が設定されていません。" }, { status: 500 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ message: "対象のサブスクリプションを指定してください。" }, { status: 400 });
  }

  const subscription = await prisma.subscription.findFirst({
    where: { id: parsed.data.subscriptionId, userId: user.id, deletedAt: null },
    include: { category: true, paymentMethod: true },
  });
  if (!subscription) {
    return NextResponse.json({ message: "対象のサブスクリプションが見つかりません。" }, { status: 404 });
  }

  const relatedSubscriptions = await prisma.subscription.findMany({
    where: {
      userId: user.id,
      deletedAt: null,
      status: "ACTIVE",
      categoryId: subscription.categoryId,
      id: { not: subscription.id },
    },
    include: { category: true },
    orderBy: { nextBillingDate: "asc" },
    take: 5,
  });

  const payload = {
    target: {
      name: subscription.name,
      category: subscription.category?.name ?? "未分類",
      monthlyPrice: yen.format(monthly(subscription.price, subscription.billingCycle, subscription.customCycleDays)),
      rawPrice: subscription.price,
      currency: subscription.currency,
      billingCycle: subscription.billingCycle,
      nextBillingDate: subscription.nextBillingDate.toISOString().slice(0, 10),
      serviceUrl: subscription.serviceUrl,
      cancellationUrl: subscription.cancellationUrl,
      memo: subscription.memo,
      lastReviewedAt: subscription.lastReviewedAt?.toISOString().slice(0, 10) ?? null,
    },
    sameCategoryContracts: (relatedSubscriptions as RelatedSubscriptionForRecommendation[]).map((item) => ({
      name: item.name,
      category: item.category?.name ?? "未分類",
      monthlyPrice: yen.format(monthly(item.price, item.billingCycle, item.customCycleDays)),
    })),
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: env.openaiModel,
      tools: [{ type: "web_search", search_context_size: "low" }],
      input: [
        {
          role: "system",
          content:
            "あなたは日本の個人・小規模事業者向けのサブスクリプション見直しアドバイザーです。現在契約中のサービスを、より新しい・安い・用途に合う候補へ変更すべきか判断します。断定しすぎず、契約前に公式サイトで最新価格と機能を確認する前提で提案してください。",
        },
        {
          role: "user",
          content: `以下の対象契約について、乗り換え・統合・解約検討のおすすめを優先度つきで返してください。同カテゴリの既存契約がある場合は重複や統合可能性も見てください。現在のサービス名と代替候補の公式URLを含めてください。\n\n${JSON.stringify(payload)}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "subscription_recommendations",
          strict: true,
          schema,
        },
      },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("OpenAI recommendation request failed.", data);
    return NextResponse.json({ message: "AIレコメンドの生成に失敗しました。OpenAI API設定を確認してください。" }, { status: 502 });
  }

  const text = outputText(data);
  try {
    return NextResponse.json(JSON.parse(text));
  } catch (error) {
    console.error("Failed to parse AI recommendation response.", error, data);
    return NextResponse.json({ message: "AIレコメンドの解析に失敗しました。" }, { status: 502 });
  }
}
