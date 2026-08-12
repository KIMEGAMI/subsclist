import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { ALLOWED_URL_PROTOCOLS, MAX_CATEGORY_NAME_LENGTH, MAX_CSV_IMPORT_ERROR_COUNT, MAX_CSV_IMPORT_FILE_BYTES, MAX_CSV_IMPORT_ROWS, MAX_MEMO_LENGTH, MAX_PAYMENT_METHOD_NAME_LENGTH, MAX_SUBSCRIPTION_NAME_LENGTH, MAX_SUBSCRIPTION_PRICE, MIN_CUSTOM_CYCLE_DAYS, MAX_CUSTOM_CYCLE_DAYS, PLACEHOLDER_HOSTS } from "@/lib/app-constants";
import { isPremiumPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { stripePaymentMethodTypes } from "@/lib/stripe-payment-methods";

type Row = Record<string, string>;

const defaultHeaders = ["サービス名", "料金", "請求周期", "次回更新日", "カテゴリ", "支払い方法", "サービスURL", "解約URL", "メモ", "カスタム周期日数"];
const rowSchema = z.object({
  name: z.string().trim().min(1).max(MAX_SUBSCRIPTION_NAME_LENGTH),
  price: z.coerce.number().int().min(0).max(MAX_SUBSCRIPTION_PRICE),
  billingCycle: z.enum(["MONTHLY", "YEARLY", "WEEKLY", "CUSTOM"]),
  nextBillingDate: z.date(),
  customCycleDays: z.number().int().min(MIN_CUSTOM_CYCLE_DAYS).max(MAX_CUSTOM_CYCLE_DAYS).nullable(),
  categoryName: z.string().trim().max(MAX_CATEGORY_NAME_LENGTH),
  paymentName: z.string().trim().max(MAX_PAYMENT_METHOD_NAME_LENGTH),
  serviceUrl: z.string(),
  cancellationUrl: z.string(),
  memo: z.string().max(MAX_MEMO_LENGTH),
});

function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }
  row.push(current.trim());
  if (row.some(Boolean)) rows.push(row);
  if (quoted) throw new Error("CSVの引用符が閉じられていません。");
  return rows;
}

function value(row: Row, keys: string[]) {
  for (const key of keys) {
    if (row[key]) return row[key];
  }
  return "";
}

function dateValue(raw: string) {
  const normalized = raw.trim().replaceAll("/", "-");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized ? null : parsed;
}

function cycleValue(raw: string) {
  if (["YEARLY", "年額", "年間", "年"].includes(raw)) return "YEARLY";
  if (["WEEKLY", "週額", "週間", "週"].includes(raw)) return "WEEKLY";
  if (["CUSTOM", "カスタム"].includes(raw)) return "CUSTOM";
  return "MONTHLY";
}

function optionalUrl(raw: string) {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if ((PLACEHOLDER_HOSTS as readonly string[]).includes(url.hostname.toLowerCase())) return null;
    return (ALLOWED_URL_PROTOCOLS as readonly string[]).includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function isHeaderRow(row: string[]) {
  return row.some((cell) => ["サービス名", "name", "service"].includes(cell.trim().toLowerCase()));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "ログインしてください。" }, { status: 401 });
  if (!user.emailVerified) return NextResponse.json({ message: "メール認証が必要です。" }, { status: 403 });
  if (!isPremiumPlan(user.plan)) return NextResponse.json({ message: "CSVインポートはPremium限定です。" }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "CSVファイルを選択してください。" }, { status: 400 });
  if (file.size > MAX_CSV_IMPORT_FILE_BYTES) return NextResponse.json({ message: "CSVファイルは1MB以下にしてください。" }, { status: 400 });

  let rows: string[][];
  try {
    rows = parseCsv((await file.text()).replace(/^\uFEFF/, ""));
  } catch {
    return NextResponse.json({ message: "CSVの形式を確認してください。" }, { status: 400 });
  }
  const [firstRow, ...remainingRows] = rows;
  if (!firstRow) return NextResponse.json({ message: "CSVに取り込む行がありません。" }, { status: 400 });
  const hasHeader = isHeaderRow(firstRow);
  const headers = hasHeader ? firstRow : defaultHeaders;
  const body = hasHeader ? remainingRows : rows;
  if (body.length === 0) return NextResponse.json({ message: "CSVに取り込む行がありません。" }, { status: 400 });
  if (body.length > MAX_CSV_IMPORT_ROWS) return NextResponse.json({ message: "CSVは200行以下にしてください。" }, { status: 400 });

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [index, cells] of body.entries()) {
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    const billingCycle = cycleValue(value(row, ["請求周期", "billingCycle", "cycle"]));
    const customCycleDaysRaw = value(row, ["カスタム周期日数", "customCycleDays"]);
    const customCycleDays = customCycleDaysRaw ? Number(customCycleDaysRaw) : null;
    const serviceUrlRaw = value(row, ["サービスURL", "serviceUrl", "url"]);
    const cancellationUrlRaw = value(row, ["解約URL", "cancellationUrl"]);
    const parsed = rowSchema.safeParse({
      name: value(row, ["サービス名", "name", "Name", "service", "Service"]),
      price: value(row, ["料金", "金額", "price", "amount", "Amount"]).replaceAll(",", ""),
      billingCycle,
      nextBillingDate: dateValue(value(row, ["次回更新日", "nextBillingDate", "renewalDate"])),
      customCycleDays,
      categoryName: value(row, ["カテゴリ", "category", "Category"]),
      paymentName: value(row, ["支払い方法", "paymentMethod", "PaymentMethod"]),
      serviceUrl: serviceUrlRaw,
      cancellationUrl: cancellationUrlRaw,
      memo: value(row, ["メモ", "memo", "note"]),
    });
    if (!parsed.success || (billingCycle === "CUSTOM" && customCycleDays === null) || (serviceUrlRaw && !optionalUrl(serviceUrlRaw)) || (cancellationUrlRaw && !optionalUrl(cancellationUrlRaw))) {
      skipped += 1;
      if (errors.length < MAX_CSV_IMPORT_ERROR_COUNT) errors.push(`${index + (hasHeader ? 2 : 1)}行目: 入力内容を確認してください。`);
      continue;
    }
    const data = parsed.data;

    const duplicate = await prisma.subscription.findFirst({ where: { userId: user.id, deletedAt: null, name: data.name } });
    if (duplicate) {
      skipped += 1;
      continue;
    }

    const paymentMethod = data.paymentName
      ? await prisma.paymentMethod.findFirst({ where: { userId: user.id, name: data.paymentName, type: { in: [...stripePaymentMethodTypes] } } })
      : null;
    if (data.paymentName && !paymentMethod) {
      skipped += 1;
      if (errors.length < MAX_CSV_IMPORT_ERROR_COUNT) errors.push(`${index + (hasHeader ? 2 : 1)}行目: 支払い方法はStripe対応の登録済み項目を指定してください。`);
      continue;
    }
    const category = data.categoryName
      ? await prisma.category.upsert({
          where: { userId_name: { userId: user.id, name: data.categoryName } },
          create: { userId: user.id, name: data.categoryName, color: "#2563eb" },
          update: {},
        })
      : null;

    await prisma.subscription.create({
      data: {
        userId: user.id,
        name: data.name,
        price: data.price,
        billingCycle: data.billingCycle,
        customCycleDays: data.billingCycle === "CUSTOM" ? data.customCycleDays : null,
        nextBillingDate: data.nextBillingDate,
        categoryId: category?.id ?? null,
        paymentMethodId: paymentMethod?.id ?? null,
        serviceUrl: optionalUrl(data.serviceUrl),
        cancellationUrl: optionalUrl(data.cancellationUrl),
        memo: data.memo || null,
      },
    });
    created += 1;
  }

  return NextResponse.json({ ok: true, created, skipped, errors: errors.slice(0, 5) });
}
