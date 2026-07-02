import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isPremiumPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

const knownServices = [
  "Adobe", "Amazon", "Amazon Prime", "Amazon Music", "Apple", "Audible", "Canva", "ChatGPT", "Claude", "DAZN", "DeepL",
  "Disney", "Dropbox", "Figma", "GitHub", "Google", "Hulu", "iCloud", "Kindle", "LINE MUSIC", "Microsoft",
  "Netflix", "Nintendo", "Notion", "OpenAI", "Perplexity", "PlayStation", "Slack", "Spotify", "U-NEXT", "Udemy",
  "Xbox", "YouTube", "Zoom", "Money Forward", "マネーフォワード", "さくら", "Sakura", "Wolt", "Proton", "Evernote",
];

const merchantKeys = [
  "摘要", "内容", "明細", "利用店名", "加盟店名", "ご利用店名", "ご利用先", "お支払先", "取引内容", "備考", "メモ", "description", "merchant", "name", "details",
];
const amountKeys = [
  "金額", "利用金額", "ご利用金額", "請求金額", "支払金額", "出金", "引落金額", "amount", "price", "debit",
];
const dateKeys = ["日付", "利用日", "ご利用日", "取引日", "引落日", "請求日", "date", "transactiondate"];

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

function keyName(value: string) {
  return value.toLowerCase().replace(/[\s　_\-（）()]/g, "");
}

function findValue(row: Record<string, string>, keys: string[]) {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [keyName(key), value]));
  for (const key of keys) {
    const value = normalized[keyName(key)];
    if (value) return value;
  }
  return "";
}

function normalizeMerchant(value: string) {
  return value
    .replace(/[0-9０-９]+/g, "")
    .replace(/[*＊#＃\-_/\\()[\]（）【】「」『』・,，.．:：]/g, " ")
    .replace(/(ｶﾌﾞ|ｶ\)|株式会社|有限会社|合同会社|利用|決済|カード|ご利用)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function amountValue(value: string) {
  const normalized = value.replace(/[￥¥円,，\s]/g, "").replace(/[▲△−－]/g, "-");
  const number = Math.abs(Number(normalized));
  return Number.isFinite(number) ? number : 0;
}

function dateValue(value: string) {
  const normalized = value.replace(/[年月.]/g, "/").replace(/日/g, "").replaceAll("-", "/");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inferCycle(dates: Date[]) {
  if (dates.length < 2) return "UNKNOWN";
  const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
  const gaps = sorted.slice(1).map((date, index) => Math.round((date.getTime() - sorted[index].getTime()) / 86400000));
  const avg = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  if (avg >= 25 && avg <= 35) return "MONTHLY";
  if (avg >= 6 && avg <= 8) return "WEEKLY";
  if (avg >= 330 && avg <= 400) return "YEARLY";
  return "CUSTOM";
}

function displayCycle(value: string) {
  if (value === "MONTHLY") return "月額の可能性";
  if (value === "WEEKLY") return "週額の可能性";
  if (value === "YEARLY") return "年額の可能性";
  if (value === "CUSTOM") return "独自周期の可能性";
  return "周期不明";
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "ログインしてください。" }, { status: 401 });
  if (!user.emailVerified) return NextResponse.json({ message: "メール認証が必要です。" }, { status: 403 });
  if (!isPremiumPlan(user.plan)) return NextResponse.json({ message: "CSV明細候補検出はPremium限定です。" }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "CSVファイルを選択してください。" }, { status: 400 });

  const rows = parseCsv((await file.text()).replace(/^\uFEFF/, ""));
  const [headers, ...body] = rows;
  if (!headers || body.length === 0) return NextResponse.json({ message: "CSVに解析する行がありません。" }, { status: 400 });

  const subscriptions = await prisma.subscription.findMany({
    where: { userId: user.id, deletedAt: null },
    select: { name: true, price: true },
  });

  const transactions = body.map((cells) => {
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    const rawName = findValue(row, merchantKeys);
    const amount = amountValue(findValue(row, amountKeys));
    const date = dateValue(findValue(row, dateKeys));
    const merchant = normalizeMerchant(rawName);
    return { rawName, merchant, amount, date };
  }).filter((item) => item.merchant && item.amount > 0);

  const groups = new Map<string, typeof transactions>();
  for (const transaction of transactions) {
    const key = `${transaction.merchant.toLowerCase()}-${transaction.amount}`;
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }

  const candidates = [...groups.values()]
    .map((items) => {
      const first = items[0];
      const known = knownServices.find((service) => first.merchant.toLowerCase().includes(service.toLowerCase()));
      const dates = items.map((item) => item.date).filter((date): date is Date => Boolean(date));
      const cycle = inferCycle(dates);
      const recurring = items.length >= 2 || cycle !== "UNKNOWN";
      const existing = subscriptions.find((subscription) =>
        first.merchant.toLowerCase().includes(subscription.name.toLowerCase()) ||
        subscription.name.toLowerCase().includes(first.merchant.toLowerCase()) ||
        Math.abs(subscription.price - first.amount) <= 20,
      );
      const confidence = Math.min(98, (known ? 36 : 0) + (recurring ? 34 : 0) + (items.length >= 3 ? 14 : 0) + (existing ? 12 : 0) + (dates.length ? 4 : 0));
      const sortedDates = [...dates].sort((a, b) => a.getTime() - b.getTime());
      return {
        name: existing?.name ?? known ?? first.merchant,
        merchant: first.merchant,
        amount: first.amount,
        occurrences: items.length,
        firstDate: sortedDates[0]?.toISOString().slice(0, 10) ?? "",
        lastDate: sortedDates.at(-1)?.toISOString().slice(0, 10) ?? "",
        confidence,
        reason: [
          known ? "有名サービス名を検出" : "同一明細を検出",
          recurring ? displayCycle(cycle) : "単発の可能性あり",
          existing ? "既存登録と近い候補" : "未登録候補",
        ].join(" / "),
        billingCycle: cycle === "UNKNOWN" ? "MONTHLY" : cycle,
      };
    })
    .filter((item) => item.confidence >= 45)
    .sort((a, b) => b.confidence - a.confidence || b.occurrences - a.occurrences)
    .slice(0, 30);

  return NextResponse.json({ candidates, totalRows: body.length, detected: candidates.length });
}
