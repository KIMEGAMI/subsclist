import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isPremiumPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

type Row = Record<string, string>;

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
  return rows;
}

function value(row: Row, keys: string[]) {
  for (const key of keys) {
    if (row[key]) return row[key];
  }
  return "";
}

function dateValue(raw: string) {
  if (!raw) return new Date();
  const parsed = new Date(raw.replaceAll("/", "-"));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function cycleValue(raw: string) {
  if (["YEARLY", "年額", "年間", "年"].includes(raw)) return "YEARLY";
  if (["WEEKLY", "週額", "週間", "週"].includes(raw)) return "WEEKLY";
  if (["CUSTOM", "カスタム"].includes(raw)) return "CUSTOM";
  return "MONTHLY";
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "ログインしてください。" }, { status: 401 });
  if (!user.emailVerified) return NextResponse.json({ message: "メール認証が必要です。" }, { status: 403 });
  if (!isPremiumPlan(user.plan)) return NextResponse.json({ message: "CSVインポートはPremium限定です。" }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "CSVファイルを選択してください。" }, { status: 400 });

  const rows = parseCsv((await file.text()).replace(/^\uFEFF/, ""));
  const [headers, ...body] = rows;
  if (!headers || body.length === 0) return NextResponse.json({ message: "CSVに取り込む行がありません。" }, { status: 400 });

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const cells of body) {
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    const name = value(row, ["サービス名", "name", "Name", "service", "Service"]);
    const price = Number(value(row, ["料金", "金額", "price", "amount", "Amount"]).replaceAll(",", ""));
    if (!name || Number.isNaN(price)) {
      skipped += 1;
      errors.push(`${body.indexOf(cells) + 2}行目: サービス名または料金が不足しています。`);
      continue;
    }

    const duplicate = await prisma.subscription.findFirst({ where: { userId: user.id, deletedAt: null, name } });
    if (duplicate) {
      skipped += 1;
      continue;
    }

    const categoryName = value(row, ["カテゴリ", "category", "Category"]);
    const paymentName = value(row, ["支払い方法", "paymentMethod", "PaymentMethod"]);
    const category = categoryName
      ? await prisma.category.upsert({
          where: { userId_name: { userId: user.id, name: categoryName } },
          create: { userId: user.id, name: categoryName, color: "#2563eb" },
          update: {},
        })
      : null;
    const paymentMethod = paymentName
      ? await prisma.paymentMethod.create({
          data: { userId: user.id, name: paymentName, type: "OTHER" },
        }).catch(async () => prisma.paymentMethod.findFirst({ where: { userId: user.id, name: paymentName } }))
      : null;

    await prisma.subscription.create({
      data: {
        userId: user.id,
        name,
        price,
        billingCycle: cycleValue(value(row, ["請求周期", "billingCycle", "cycle"])),
        nextBillingDate: dateValue(value(row, ["次回更新日", "nextBillingDate", "renewalDate"])),
        categoryId: category?.id ?? null,
        paymentMethodId: paymentMethod?.id ?? null,
        serviceUrl: value(row, ["サービスURL", "serviceUrl", "url"]) || null,
        cancellationUrl: value(row, ["解約URL", "cancellationUrl"]) || null,
        memo: value(row, ["メモ", "memo", "note"]) || null,
      },
    });
    created += 1;
  }

  return NextResponse.json({ ok: true, created, skipped, errors: errors.slice(0, 5) });
}
