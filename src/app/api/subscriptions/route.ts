import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FREE_SUBSCRIPTION_LIMIT } from "@/lib/plans";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  price: z.coerce.number().min(0),
  billingCycle: z.enum(["MONTHLY", "YEARLY", "WEEKLY", "CUSTOM"]),
  nextBillingDate: z.string().min(1),
  categoryId: z.string().optional(),
  paymentMethodId: z.string().optional(),
  status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]),
  notifyDaysBefore: z.coerce.number().min(0).optional(),
  serviceUrl: z.string().optional(),
  cancellationUrl: z.string().optional(),
  trialEndsAt: z.string().optional(),
  cancellationDeadline: z.string().optional(),
  lastReviewedAt: z.string().optional(),
  usageFrequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "RARELY", "UNKNOWN"]).optional(),
  priority: z.enum(["ESSENTIAL", "USEFUL", "OPTIONAL", "UNKNOWN"]).optional(),
  logoUrl: z.string().optional(),
  memo: z.string().max(1000).optional(),
});

function optionalDate(value?: string) {
  return value ? new Date(value) : null;
}

function optionalUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (["example.com", "www.example.com"].includes(url.hostname.toLowerCase())) return null;
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "ログインしてください。" }, { status: 401 });
  if (!user.emailVerified) return NextResponse.json({ message: "メール認証が必要です。" }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "入力内容を確認してください。" }, { status: 400 });

  const subscriptionCount = await prisma.subscription.count({ where: { userId: user.id, deletedAt: null } });
  if (user.plan === "FREE" && subscriptionCount >= FREE_SUBSCRIPTION_LIMIT) {
    return NextResponse.json({ message: "Freeプランではサブスク登録は10件までです。Premiumに変更すると無制限に登録できます。" }, { status: 403 });
  }

  const data = parsed.data;
  const subscription = await prisma.subscription.create({
    data: {
      userId: user.id,
      name: data.name,
      price: data.price,
      billingCycle: data.billingCycle,
      nextBillingDate: new Date(data.nextBillingDate),
      categoryId: data.categoryId || null,
      paymentMethodId: data.paymentMethodId || null,
      status: data.status,
      notifyDaysBefore: data.notifyDaysBefore,
      serviceUrl: optionalUrl(data.serviceUrl),
      cancellationUrl: optionalUrl(data.cancellationUrl),
      trialEndsAt: optionalDate(data.trialEndsAt),
      cancellationDeadline: optionalDate(data.cancellationDeadline),
      lastReviewedAt: optionalDate(data.lastReviewedAt),
      usageFrequency: data.usageFrequency ?? "UNKNOWN",
      priority: data.priority ?? "UNKNOWN",
      logoUrl: data.logoUrl || null,
      memo: data.memo || null,
    },
  });

  return NextResponse.json({ id: subscription.id });
}
