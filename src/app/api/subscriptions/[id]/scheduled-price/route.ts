import { NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { parseIsoCalendarDate } from "@/lib/calendar-date";
import { isPremiumPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";
import {
  scheduledPriceDateAllowed,
  scheduledPriceInputSchema,
} from "@/lib/scheduled-price";

async function findOwnedSubscription(id: string, userId: string) {
  return prisma.subscription.findFirst({
    where: { id, userId, deletedAt: null },
    select: {
      id: true,
      price: true,
      billingCycle: true,
      customCycleDays: true,
      scheduledPrice: true,
      scheduledPriceAt: true,
    },
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  if (!isPremiumPlan(access.user.plan)) {
    return NextResponse.json(
      { message: "将来の価格変更予約はPremium限定です。" },
      { status: 403 },
    );
  }
  const { id } = await params;
  const parsed = scheduledPriceInputSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "変更後の料金と変更予定日を正しく入力してください。" },
      { status: 400 },
    );
  }
  const subscription = await findOwnedSubscription(id, access.user.id);
  if (!subscription) {
    return NextResponse.json(
      { message: "対象のサブスクリプションが見つかりません。" },
      { status: 404 },
    );
  }
  if (parsed.data.price === subscription.price) {
    return NextResponse.json(
      { message: "変更後の料金には現在と異なる金額を入力してください。" },
      { status: 400 },
    );
  }
  const scheduledPriceAt = parseIsoCalendarDate(parsed.data.effectiveAt) as Date;
  if (!scheduledPriceDateAllowed(scheduledPriceAt)) {
    return NextResponse.json(
      { message: "変更予定日は今日以降の日付を選択してください。" },
      { status: 400 },
    );
  }

  const updated = await prisma.subscription.updateMany({
    where: { id, userId: access.user.id, deletedAt: null },
    data: { scheduledPrice: parsed.data.price, scheduledPriceAt },
  });
  if (updated.count !== 1) {
    return NextResponse.json(
      { message: "契約情報が変更されたため、ページを再読み込みしてください。" },
      { status: 409 },
    );
  }
  return NextResponse.json({
    id,
    scheduledPrice: parsed.data.price,
    scheduledPriceAt: scheduledPriceAt.toISOString(),
    message: "価格変更の予定を保存しました。",
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { id } = await params;
  const subscription = await findOwnedSubscription(id, access.user.id);
  if (!subscription) {
    return NextResponse.json(
      { message: "対象のサブスクリプションが見つかりません。" },
      { status: 404 },
    );
  }
  const updated = await prisma.subscription.updateMany({
    where: { id, userId: access.user.id, deletedAt: null },
    data: { scheduledPrice: null, scheduledPriceAt: null },
  });
  if (updated.count !== 1) {
    return NextResponse.json(
      { message: "契約情報が変更されたため、ページを再読み込みしてください。" },
      { status: 409 },
    );
  }
  return NextResponse.json({ id, message: "価格変更の予定を解除しました。" });
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { id } = await params;
  const subscription = await findOwnedSubscription(id, access.user.id);
  if (!subscription) {
    return NextResponse.json(
      { message: "対象のサブスクリプションが見つかりません。" },
      { status: 404 },
    );
  }
  if (subscription.scheduledPrice === null || !subscription.scheduledPriceAt) {
    return NextResponse.json(
      { message: "反映する価格変更予定がありません。" },
      { status: 409 },
    );
  }

  const scheduledPrice = subscription.scheduledPrice;
  const scheduledPriceAt = subscription.scheduledPriceAt;
  const appliedAt = new Date();
  const updated = await prisma.$transaction(async (transaction) => {
    const result = await transaction.subscription.updateMany({
      where: {
        id,
        userId: access.user.id,
        deletedAt: null,
        price: subscription.price,
        scheduledPrice,
        scheduledPriceAt,
      },
      data: {
        price: scheduledPrice,
        scheduledPrice: null,
        scheduledPriceAt: null,
      },
    });
    if (result.count !== 1) return false;
    if (subscription.price !== scheduledPrice) {
      await transaction.subscriptionPriceHistory.create({
        data: {
          userId: access.user.id,
          subscriptionId: id,
          price: subscription.price,
          billingCycle: subscription.billingCycle,
          customCycleDays: subscription.customCycleDays,
          effectiveFrom: appliedAt,
        },
      });
    }
    return true;
  });
  if (!updated) {
    return NextResponse.json(
      { message: "契約情報が変更されたため、ページを再読み込みしてください。" },
      { status: 409 },
    );
  }
  return NextResponse.json({
    id,
    price: scheduledPrice,
    message: "予定していた料金を現在価格へ反映しました。",
  });
}
