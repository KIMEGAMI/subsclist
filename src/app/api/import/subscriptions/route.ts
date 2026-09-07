import { NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import {
  DEFAULT_NOTIFY_DAYS_BEFORE,
  CSV_IMPORT_TRANSACTION_TIMEOUT_MS,
  MAX_CSV_IMPORT_ERROR_COUNT,
  MAX_CSV_IMPORT_FILE_BYTES,
  MAX_CSV_IMPORT_ROWS,
} from "@/lib/app-constants";
import { isPremiumPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { stripePaymentMethodTypes } from "@/lib/stripe-payment-methods";
import {
  normalizeSubscriptionImportName,
  parseSubscriptionCsvImport,
} from "@/lib/subscription-csv-import";

export async function POST(request: Request) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  if (!isPremiumPlan(user.plan)) {
    return NextResponse.json(
      { message: "CSVインポートはPremium限定です。" },
      { status: 403 },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { message: "CSVファイルを選択してください。" },
      { status: 400 },
    );
  }
  if (file.size > MAX_CSV_IMPORT_FILE_BYTES) {
    return NextResponse.json(
      { message: "CSVファイルは1MB以下にしてください。" },
      { status: 400 },
    );
  }

  let parsed: ReturnType<typeof parseSubscriptionCsvImport>;
  try {
    parsed = parseSubscriptionCsvImport(await file.text());
  } catch {
    return NextResponse.json(
      { message: "CSVの形式を確認してください。" },
      { status: 400 },
    );
  }
  if (parsed.rows.length === 0) {
    return NextResponse.json(
      { message: "CSVに取り込む行がありません。" },
      { status: 400 },
    );
  }
  if (parsed.rows.length > MAX_CSV_IMPORT_ROWS) {
    return NextResponse.json(
      { message: `CSVは${MAX_CSV_IMPORT_ROWS}行以下にしてください。` },
      { status: 400 },
    );
  }

  const [preference, existingSubscriptions, paymentMethods] =
    await Promise.all([
      prisma.userPreference.findUnique({
        where: { userId: user.id },
        select: { defaultNotifyDaysBefore: true },
      }),
      prisma.subscription.findMany({
        where: { userId: user.id, deletedAt: null },
        select: { name: true },
      }),
      prisma.paymentMethod.findMany({
        where: {
          userId: user.id,
          type: { in: [...stripePaymentMethodTypes] },
        },
        select: { id: true, name: true },
      }),
    ]);
  const defaultNotifyDaysBefore =
    preference?.defaultNotifyDaysBefore ?? DEFAULT_NOTIFY_DAYS_BEFORE;
  const existingNames = new Set(
    existingSubscriptions.map((item) => normalizeSubscriptionImportName(item.name)),
  );
  const paymentMethodsByName = new Map(
    paymentMethods.map((item) => [normalizeSubscriptionImportName(item.name), item]),
  );

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];
  try {
    await prisma.$transaction(async (transaction) => {
      for (const row of parsed.rows) {
        const data = row.data;
        if (!data) {
          skipped += 1;
          if (errors.length < MAX_CSV_IMPORT_ERROR_COUNT) {
            errors.push(`${row.rowNumber}行目: ${row.issues.join(" ")}`);
          }
          continue;
        }
        const nameKey = normalizeSubscriptionImportName(data.name);
        if (existingNames.has(nameKey)) {
          skipped += 1;
          if (errors.length < MAX_CSV_IMPORT_ERROR_COUNT) {
            errors.push(`${row.rowNumber}行目: 同名のサービスは既に登録されています。`);
          }
          continue;
        }
        const paymentMethod = data.paymentName
          ? paymentMethodsByName.get(normalizeSubscriptionImportName(data.paymentName)) ?? null
          : null;
        if (data.paymentName && !paymentMethod) {
          skipped += 1;
          if (errors.length < MAX_CSV_IMPORT_ERROR_COUNT) {
            errors.push(
              `${row.rowNumber}行目: 支払い方法はStripe対応の登録済み項目を指定してください。`,
            );
          }
          continue;
        }

        const category = data.categoryName
          ? await transaction.category.upsert({
              where: {
                userId_name: { userId: user.id, name: data.categoryName },
              },
              create: {
                userId: user.id,
                name: data.categoryName,
                color: "#2563eb",
              },
              update: {},
            })
          : null;
        const subscription = await transaction.subscription.create({
          data: {
            userId: user.id,
            name: data.name,
            price: data.price,
            currency: data.currency,
            sourceAmountMinor: data.sourceAmountMinor,
            exchangeRateToJpyScaled: data.exchangeRateToJpyScaled,
            exchangeRateUpdatedAt: data.exchangeRateUpdatedAt,
            billingCycle: data.billingCycle,
            customCycleDays:
              data.billingCycle === "CUSTOM" ? data.customCycleDays : null,
            nextBillingDate: data.nextBillingDate,
            categoryId: category?.id ?? null,
            paymentMethodId: paymentMethod?.id ?? null,
            billingProvider: data.billingProvider,
            notifyDaysBefore: defaultNotifyDaysBefore,
            serviceUrl: data.serviceUrl,
            cancellationUrl: data.cancellationUrl,
            businessUsePercent: data.businessUsePercent,
            defaultAccountingLabel: data.defaultAccountingLabel,
            memo: data.memo || null,
          },
        });
        await transaction.notificationSetting.create({
          data: {
            userId: user.id,
            subscriptionId: subscription.id,
            daysBefore: defaultNotifyDaysBefore,
            enabled: true,
          },
        });
        existingNames.add(nameKey);
        created += 1;
      }
    }, { timeout: CSV_IMPORT_TRANSACTION_TIMEOUT_MS });
  } catch {
    console.error("Subscription CSV import transaction failed.");
    return NextResponse.json(
      { message: "CSVの登録に失敗しました。データは登録されていません。時間をおいて、もう一度お試しください。" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    created,
    skipped,
    errors,
  });
}
