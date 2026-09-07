import { NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { annualAmount, isoDate, monthlyAmount, nextBillingOccurrence } from "@/lib/billing";
import { serializeCsvCell } from "@/lib/csv";
import { businessUseAmount } from "@/lib/subscription-business";
import { isPremiumPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { billingProviderLabel } from "@/lib/subscription-billing-provider";
import {
  formatExchangeRateScaled,
  formatSourceAmountMinor,
  isSubscriptionCurrency,
} from "@/lib/subscription-currency";

const yenless = (value: number) => Math.round(value).toString();

type ExportSubscription = {
  name: string;
  price: number;
  currency: string;
  sourceAmountMinor: number | null;
  exchangeRateToJpyScaled: number | null;
  exchangeRateUpdatedAt: Date | null;
  billingCycle: string;
  customCycleDays: number | null;
  businessUsePercent: number;
  defaultAccountingLabel: string | null;
  nextBillingDate: Date;
  trialEndsAt: Date | null;
  cancellationDeadline: Date | null;
  lastReviewedAt: Date | null;
  category: { name: string } | null;
  paymentMethod: { name: string } | null;
  billingProvider: string;
  status: string;
  memo: string | null;
};

function dateCell(value?: Date | null) {
  return isoDate(value);
}

export async function GET() {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  if (!isPremiumPlan(user.plan)) {
    return NextResponse.json({ message: "CSV出力はPremium限定です。" }, { status: 403 });
  }
  const subscriptions = await prisma.subscription.findMany({
    where: { userId: user.id, deletedAt: null },
    include: { category: true, paymentMethod: true },
    orderBy: { createdAt: "desc" },
  });
  const rows = [
    ["サービス名", "金額", "請求周期", "月額換算", "年額換算", "仕事利用割合", "仕事利用分（月額見込み）", "整理用初期科目", "次回更新日", "無料トライアル終了日", "解約期限", "最終見直し日", "カテゴリ", "支払い方法", "ステータス", "メモ", "請求元", "請求通貨", "原通貨額", "円換算レート", "換算レート確認日"],
    ...(subscriptions as ExportSubscription[]).map((item) => {
      const monthly = monthlyAmount(item.price, item.billingCycle, item.customCycleDays);
      const currency = isSubscriptionCurrency(item.currency)
        ? item.currency
        : "JPY";
      return [
        item.name,
        String(item.price),
        item.billingCycle,
        yenless(monthly),
        yenless(annualAmount(item.price, item.billingCycle, item.customCycleDays)),
        String(item.businessUsePercent),
        yenless(businessUseAmount(monthly, item.businessUsePercent)),
        item.defaultAccountingLabel ?? "",
        isoDate(item.status === "ACTIVE" ? nextBillingOccurrence(item.nextBillingDate, item.billingCycle, item.customCycleDays) : item.nextBillingDate),
        dateCell(item.trialEndsAt),
        dateCell(item.cancellationDeadline),
        dateCell(item.lastReviewedAt),
        item.category?.name ?? "",
        item.paymentMethod?.name ?? "",
        item.status,
        item.memo ?? "",
        billingProviderLabel(item.billingProvider),
        currency,
        currency !== "JPY" && item.sourceAmountMinor !== null
          ? formatSourceAmountMinor(item.sourceAmountMinor, currency)
          : "",
        currency !== "JPY" && item.exchangeRateToJpyScaled !== null
          ? formatExchangeRateScaled(item.exchangeRateToJpyScaled)
          : "",
        currency !== "JPY" ? dateCell(item.exchangeRateUpdatedAt) : "",
      ];
    }),
  ];
  const csv = rows.map((row) => row.map(serializeCsvCell).join(",")).join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="subscriptions.csv"',
    },
  });
}
