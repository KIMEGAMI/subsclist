import { NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import {
  MAX_CSV_IMPORT_FILE_BYTES,
  MAX_CSV_IMPORT_ROWS,
} from "@/lib/app-constants";
import { isPremiumPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { stripePaymentMethodTypes } from "@/lib/stripe-payment-methods";
import {
  buildSubscriptionImportPreview,
  parseSubscriptionCsvImport,
} from "@/lib/subscription-csv-import";

export async function POST(request: Request) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  if (!isPremiumPlan(user.plan)) {
    return NextResponse.json(
      { message: "CSVプレビューはPremium限定です。" },
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
      { message: "CSVの引用符や改行形式を確認してください。" },
      { status: 400 },
    );
  }
  if (parsed.rows.length === 0) {
    return NextResponse.json(
      { message: "CSVに確認する行がありません。" },
      { status: 400 },
    );
  }
  if (parsed.rows.length > MAX_CSV_IMPORT_ROWS) {
    return NextResponse.json(
      { message: `CSVは${MAX_CSV_IMPORT_ROWS}行以下にしてください。` },
      { status: 400 },
    );
  }

  const [existingSubscriptions, paymentMethods] = await Promise.all([
    prisma.subscription.findMany({
      where: { userId: user.id, deletedAt: null },
      select: { name: true },
    }),
    prisma.paymentMethod.findMany({
      where: {
        userId: user.id,
        type: { in: [...stripePaymentMethodTypes] },
      },
      select: { name: true },
    }),
  ]);
  const rows = buildSubscriptionImportPreview({
    rows: parsed.rows,
    existingSubscriptionNames: existingSubscriptions.map((item) => item.name),
    availablePaymentMethodNames: paymentMethods.map((item) => item.name),
  });

  return NextResponse.json(
    {
      hasHeader: parsed.hasHeader,
      rows,
      validCount: rows.filter((row) => row.valid).length,
      invalidCount: rows.filter((row) => !row.valid).length,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
