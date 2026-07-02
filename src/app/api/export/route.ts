import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isPremiumPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

const yenless = (value: number) => Math.round(value).toString();

type ExportSubscription = {
  name: string;
  price: number;
  billingCycle: string;
  customCycleDays: number | null;
  nextBillingDate: Date;
  trialEndsAt: Date | null;
  cancellationDeadline: Date | null;
  lastReviewedAt: Date | null;
  category: { name: string } | null;
  paymentMethod: { name: string } | null;
  status: string;
  memo: string | null;
};

function monthly(price: number, cycle: string, customCycleDays?: number | null) {
  if (cycle === "YEARLY") return price / 12;
  if (cycle === "WEEKLY") return price * 4.345;
  if (cycle === "CUSTOM") return customCycleDays ? price * (30.437 / customCycleDays) : price;
  return price;
}

function dateCell(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "ログインしてください。" }, { status: 401 });
  if (!user.emailVerified) return NextResponse.json({ message: "メール認証が必要です。" }, { status: 403 });
  if (!isPremiumPlan(user.plan)) {
    return NextResponse.json({ message: "CSV出力はPremium限定です。" }, { status: 403 });
  }
  const subscriptions = await prisma.subscription.findMany({
    where: { userId: user.id, deletedAt: null },
    include: { category: true, paymentMethod: true },
    orderBy: { createdAt: "desc" },
  });
  const rows = [
    ["サービス名", "金額", "請求周期", "月額換算", "年額換算", "次回更新日", "無料トライアル終了日", "解約期限", "最終見直し日", "カテゴリ", "支払い方法", "ステータス", "メモ"],
    ...(subscriptions as ExportSubscription[]).map((item) => {
      const monthlyAmount = monthly(item.price, item.billingCycle, item.customCycleDays);
      return [
        item.name,
        String(item.price),
        item.billingCycle,
        yenless(monthlyAmount),
        yenless(monthlyAmount * 12),
        item.nextBillingDate.toISOString().slice(0, 10),
        dateCell(item.trialEndsAt),
        dateCell(item.cancellationDeadline),
        dateCell(item.lastReviewedAt),
        item.category?.name ?? "",
        item.paymentMethod?.name ?? "",
        item.status,
        item.memo ?? "",
      ];
    }),
  ];
  const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="subscriptions.csv"',
    },
  });
}
