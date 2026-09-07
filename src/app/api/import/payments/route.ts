import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import {
  MAX_CSV_IMPORT_ROWS,
  MAX_STATEMENT_MERCHANT_ALIASES_PER_SUBSCRIPTION,
  MAX_STATEMENT_MERCHANT_LABEL_LENGTH,
  MAX_SUBSCRIPTION_PRICE,
} from "@/lib/app-constants";
import { parseIsoCalendarDate } from "@/lib/calendar-date";
import { isPremiumPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";
import { duplicateStatementPaymentKeys } from "@/lib/statement-import";
import { buildStatementMerchantAliasWrites } from "@/lib/statement-merchant-alias";

const itemSchema = z.object({
  rowNumber: z.number().int().min(2).max(MAX_CSV_IMPORT_ROWS + 1),
  subscriptionId: z.string().trim().min(1).max(191),
  amount: z.number().int().min(1).max(MAX_SUBSCRIPTION_PRICE),
  paidAt: z.string().refine((value) => parseIsoCalendarDate(value) !== null),
  merchant: z.string().trim().max(MAX_STATEMENT_MERCHANT_LABEL_LENGTH).optional(),
  rememberMerchantAlias: z.boolean().default(false),
});
const schema = z.object({
  items: z.array(itemSchema).min(1).max(MAX_CSV_IMPORT_ROWS),
});
const conflictError = "STATEMENT_PAYMENT_IMPORT_CONFLICT";

function isUniqueConstraintError(error: unknown) {
  return error instanceof Error
    && "code" in error
    && (error as Error & { code?: unknown }).code === "P2002";
}

export async function POST(request: Request) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  if (!isPremiumPlan(user.plan)) {
    return NextResponse.json({ message: "明細からの支払い登録はPremium限定です。" }, { status: 403 });
  }

  const parsed = schema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "登録する支払い行を確認してください。" }, { status: 400 });
  }
  if (duplicateStatementPaymentKeys(parsed.data.items).size > 0) {
    return NextResponse.json({ message: "選択した明細内に同じ契約・支払日・金額が重複しています。" }, { status: 400 });
  }
  const aliasWrites = buildStatementMerchantAliasWrites(parsed.data.items);
  if (!aliasWrites.ok) {
    return NextResponse.json({ message: aliasWrites.message }, { status: 400 });
  }

  const subscriptionIds = [...new Set(parsed.data.items.map((item) => item.subscriptionId))];
  const subscriptions = await prisma.subscription.findMany({
    where: { id: { in: subscriptionIds }, userId: user.id, deletedAt: null },
    select: {
      id: true,
      name: true,
      businessUsePercent: true,
      defaultAccountingLabel: true,
      category: { select: { name: true } },
      paymentMethod: { select: { name: true } },
    },
  });
  if (subscriptions.length !== subscriptionIds.length) {
    return NextResponse.json({ message: "選択した契約を確認できませんでした。再解析してください。" }, { status: 409 });
  }
  const subscriptionById = new Map(subscriptions.map((subscription) => [subscription.id, subscription]));

  const aliasKeys = aliasWrites.aliases.map((alias) => alias.normalizedMerchant);
  const [existingAliases, aliasesForSubscriptions] = aliasKeys.length > 0
    ? await Promise.all([
        prisma.statementMerchantAlias.findMany({
          where: { userId: user.id, normalizedMerchant: { in: aliasKeys } },
          select: { subscriptionId: true, normalizedMerchant: true },
        }),
        prisma.statementMerchantAlias.findMany({
          where: {
            userId: user.id,
            subscriptionId: { in: [...new Set(aliasWrites.aliases.map((alias) => alias.subscriptionId))] },
          },
          select: { subscriptionId: true },
        }),
      ])
    : [[], []];
  const existingAliasByKey = new Map(
    existingAliases.map((alias) => [alias.normalizedMerchant, alias.subscriptionId]),
  );
  if (aliasWrites.aliases.some((alias) => {
    const existingSubscriptionId = existingAliasByKey.get(alias.normalizedMerchant);
    return existingSubscriptionId && existingSubscriptionId !== alias.subscriptionId;
  })) {
    return NextResponse.json(
      { message: "選択した明細名義は別の契約に登録済みです。契約詳細で名義ルールを確認してください。" },
      { status: 409 },
    );
  }
  const newAliases = aliasWrites.aliases.filter(
    (alias) => !existingAliasByKey.has(alias.normalizedMerchant),
  );
  const currentAliasCount = new Map<string, number>();
  for (const alias of aliasesForSubscriptions) {
    currentAliasCount.set(alias.subscriptionId, (currentAliasCount.get(alias.subscriptionId) ?? 0) + 1);
  }
  const newAliasCount = new Map<string, number>();
  for (const alias of newAliases) {
    newAliasCount.set(alias.subscriptionId, (newAliasCount.get(alias.subscriptionId) ?? 0) + 1);
  }
  if ([...newAliasCount].some(([subscriptionId, count]) =>
    (currentAliasCount.get(subscriptionId) ?? 0) + count
      > MAX_STATEMENT_MERCHANT_ALIASES_PER_SUBSCRIPTION
  )) {
    return NextResponse.json(
      { message: `1契約に保存できる明細名義は${MAX_STATEMENT_MERCHANT_ALIASES_PER_SUBSCRIPTION}件までです。` },
      { status: 400 },
    );
  }

  try {
    const importResult = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.paymentHistory.findMany({
        where: {
          userId: user.id,
          OR: parsed.data.items.map((item) => ({
            subscriptionId: item.subscriptionId,
            amount: item.amount,
            paidAt: parseIsoCalendarDate(item.paidAt) as Date,
          })),
        },
        select: { subscriptionId: true, amount: true, paidAt: true },
      });
      if (existing.length > 0) throw new Error(conflictError);

      const savedAliasCount = newAliases.length > 0
        ? (await transaction.statementMerchantAlias.createMany({
            data: newAliases.map((alias) => ({
              ...alias,
              userId: user.id,
            })),
            skipDuplicates: true,
          })).count
        : 0;
      const paymentImport = await transaction.statementPaymentImport.create({
        data: {
          userId: user.id,
          importedCount: parsed.data.items.length,
          savedAliasCount,
        },
        select: { id: true, importedCount: true, savedAliasCount: true, createdAt: true },
      });
      const result = await transaction.paymentHistory.createMany({
        data: parsed.data.items.map((item) => {
          const subscription = subscriptionById.get(item.subscriptionId);
          if (!subscription) throw new Error(conflictError);
          return {
            subscriptionId: subscription.id,
            userId: user.id,
            amount: item.amount,
            paidAt: parseIsoCalendarDate(item.paidAt) as Date,
            businessUsePercent: subscription.businessUsePercent,
            accountingLabel: subscription.defaultAccountingLabel,
            statementPaymentImportId: paymentImport.id,
            subscriptionNameSnapshot: subscription.name,
            categoryNameSnapshot: subscription.category?.name ?? null,
            paymentMethodNameSnapshot: subscription.paymentMethod?.name ?? null,
          };
        }),
      });
      if (result.count !== parsed.data.items.length) throw new Error(conflictError);
      return { paymentImport, createdCount: result.count };
    });
    return NextResponse.json({
      createdCount: importResult.createdCount,
      savedAliasCount: importResult.paymentImport.savedAliasCount,
      paymentImport: {
        ...importResult.paymentImport,
        remainingCount: importResult.createdCount,
        undoneAt: null,
        undoneCount: null,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === conflictError) {
      return NextResponse.json(
        { message: "同じ契約・支払日・金額の履歴が既にあります。明細を再解析してください。" },
        { status: 409 },
      );
    }
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { message: "明細名義ルールが同時に変更されました。再解析してから登録してください。" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { message: "支払い履歴の一括登録に失敗しました。時間をおいてもう一度お試しください。" },
      { status: 500 },
    );
  }
}
