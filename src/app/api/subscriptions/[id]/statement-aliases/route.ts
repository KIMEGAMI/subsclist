import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { MAX_STATEMENT_MERCHANT_ALIASES_PER_SUBSCRIPTION } from "@/lib/app-constants";
import { isPremiumPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";
import {
  statementMerchantAliasData,
  statementMerchantAliasMutationSchema,
} from "@/lib/statement-merchant-alias";

const deleteSchema = z.object({ aliasId: z.string().trim().min(1).max(191) });

function isUniqueConstraintError(error: unknown) {
  return error instanceof Error
    && "code" in error
    && (error as Error & { code?: unknown }).code === "P2002";
}

async function ownedSubscription(id: string, userId: string) {
  return prisma.subscription.findFirst({
    where: { id, userId, deletedAt: null },
    select: { id: true },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  if (!isPremiumPlan(access.user.plan)) {
    return NextResponse.json(
      { message: "明細名義ルールの追加はPremium限定です。" },
      { status: 403 },
    );
  }
  const { id } = await params;
  const parsed = statementMerchantAliasMutationSchema.safeParse(
    await readJsonBody(request),
  );
  const alias = parsed.success ? statementMerchantAliasData(parsed.data.merchant) : null;
  if (!alias) {
    return NextResponse.json(
      { message: "カード・銀行明細に表示される名義を3文字以上で入力してください。" },
      { status: 400 },
    );
  }
  if (!(await ownedSubscription(id, access.user.id))) {
    return NextResponse.json(
      { message: "対象のサブスクリプションが見つかりません。" },
      { status: 404 },
    );
  }

  const existing = await prisma.statementMerchantAlias.findUnique({
    where: {
      userId_normalizedMerchant: {
        userId: access.user.id,
        normalizedMerchant: alias.normalizedMerchant,
      },
    },
    select: { id: true, subscriptionId: true },
  });
  if (existing?.subscriptionId === id) {
    return NextResponse.json({ id: existing.id, created: false });
  }
  if (existing) {
    return NextResponse.json(
      { message: "この明細名義は別の契約に登録済みです。" },
      { status: 409 },
    );
  }
  const aliasCount = await prisma.statementMerchantAlias.count({
    where: { userId: access.user.id, subscriptionId: id },
  });
  if (aliasCount >= MAX_STATEMENT_MERCHANT_ALIASES_PER_SUBSCRIPTION) {
    return NextResponse.json(
      { message: `1契約に保存できる明細名義は${MAX_STATEMENT_MERCHANT_ALIASES_PER_SUBSCRIPTION}件までです。` },
      { status: 400 },
    );
  }

  try {
    const created = await prisma.statementMerchantAlias.create({
      data: { ...alias, userId: access.user.id, subscriptionId: id },
      select: { id: true },
    });
    return NextResponse.json({ id: created.id, created: true });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { message: "明細名義ルールが同時に変更されました。ページを再読み込みしてください。" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { message: "明細名義ルールを保存できませんでした。" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { id } = await params;
  const parsed = deleteSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "削除する明細名義ルールを確認してください。" },
      { status: 400 },
    );
  }
  if (!(await ownedSubscription(id, access.user.id))) {
    return NextResponse.json(
      { message: "対象のサブスクリプションが見つかりません。" },
      { status: 404 },
    );
  }
  const deleted = await prisma.statementMerchantAlias.deleteMany({
    where: {
      id: parsed.data.aliasId,
      userId: access.user.id,
      subscriptionId: id,
    },
  });
  if (deleted.count !== 1) {
    return NextResponse.json(
      { message: "明細名義ルールが見つかりません。ページを再読み込みしてください。" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
