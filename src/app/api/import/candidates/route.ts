import { NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import {
  CSV_CONFIDENCE_WEIGHTS,
  CSV_EXISTING_PRICE_TOLERANCE,
  MAX_CSV_IMPORT_FILE_BYTES,
  CSV_MAX_CANDIDATE_COUNT,
  CSV_MAX_CONFIDENCE,
  CSV_MAX_MONTHLY_GAP_DAYS,
  CSV_MAX_WEEKLY_GAP_DAYS,
  CSV_MAX_YEARLY_GAP_DAYS,
  CSV_MIN_CANDIDATE_CONFIDENCE,
  CSV_MIN_MONTHLY_GAP_DAYS,
  CSV_MIN_WEEKLY_GAP_DAYS,
  CSV_MIN_YEARLY_GAP_DAYS,
  CSV_RECURRING_MIN_OCCURRENCES,
  CSV_RECURRING_OCCURRENCE_THRESHOLD,
} from "@/lib/app-constants";
import { isoDate, MILLISECONDS_PER_DAY } from "@/lib/billing";
import { parseIsoCalendarDate } from "@/lib/calendar-date";
import { candidateBillingCycle, candidateNextBillingDate } from "@/lib/csv-candidate";
import { isPremiumPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import {
  buildStatementPaymentMatches,
  normalizeStatementMerchant,
  parseStatementCsv,
} from "@/lib/statement-import";

const knownServices = [
  "Adobe", "Amazon", "Amazon Prime", "Amazon Music", "Apple", "Audible", "Canva", "ChatGPT", "Claude", "DAZN", "DeepL",
  "Disney", "Dropbox", "Figma", "GitHub", "Google", "Hulu", "iCloud", "Kindle", "LINE MUSIC", "Microsoft",
  "Netflix", "Nintendo", "Notion", "OpenAI", "Perplexity", "PlayStation", "Slack", "Spotify", "U-NEXT", "Udemy",
  "Xbox", "YouTube", "Zoom", "Money Forward", "マネーフォワード", "さくら", "Sakura", "Wolt", "Proton", "Evernote",
] as const;

function inferCycle(dates: Date[]) {
  if (dates.length < 2) return "UNKNOWN";
  const sorted = [...dates].sort((left, right) => left.getTime() - right.getTime());
  const gaps = sorted.slice(1).map((date, index) => Math.round(
    (date.getTime() - sorted[index].getTime()) / MILLISECONDS_PER_DAY,
  ));
  const average = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  if (average >= CSV_MIN_MONTHLY_GAP_DAYS && average <= CSV_MAX_MONTHLY_GAP_DAYS) return "MONTHLY";
  if (average >= CSV_MIN_WEEKLY_GAP_DAYS && average <= CSV_MAX_WEEKLY_GAP_DAYS) return "WEEKLY";
  if (average >= CSV_MIN_YEARLY_GAP_DAYS && average <= CSV_MAX_YEARLY_GAP_DAYS) return "YEARLY";
  return "CUSTOM";
}

function cycleLabel(value: string) {
  if (value === "MONTHLY") return "月額の可能性";
  if (value === "WEEKLY") return "週額の可能性";
  if (value === "YEARLY") return "年額の可能性";
  if (value === "CUSTOM") return "独自周期の可能性";
  return "周期不明";
}

export async function POST(request: Request) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  if (!isPremiumPlan(user.plan)) {
    return NextResponse.json({ message: "CSV明細の解析はPremium限定です。" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "CSVファイルを選択してください。" }, { status: 400 });
  }
  if (file.size > MAX_CSV_IMPORT_FILE_BYTES) {
    return NextResponse.json({ message: "CSVファイルは1MB以下にしてください。" }, { status: 400 });
  }

  let parsed: ReturnType<typeof parseStatementCsv>;
  try {
    parsed = parseStatementCsv(await file.text());
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("CSV")
      ? error.message
      : "CSVの形式を確認してください。";
    return NextResponse.json({ message }, { status: 400 });
  }

  const [subscriptions, merchantAliases] = await Promise.all([
    prisma.subscription.findMany({
      where: { userId: user.id, deletedAt: null },
      select: { id: true, name: true, price: true, status: true },
      orderBy: { name: "asc" },
    }),
    prisma.statementMerchantAlias.findMany({
      where: { userId: user.id, subscription: { deletedAt: null } },
      select: { subscriptionId: true, normalizedMerchant: true },
    }),
  ]);
  const aliasedSubscriptionIdByMerchant = new Map(
    merchantAliases.map((alias) => [alias.normalizedMerchant, alias.subscriptionId]),
  );
  const validTransactions = parsed.transactions.filter((transaction) =>
    transaction.issues.length === 0 && transaction.amount !== null && transaction.paidAt !== null,
  );
  const dates = [...new Set(validTransactions.map((transaction) => transaction.paidAt))]
    .map((date) => parseIsoCalendarDate(date ?? ""))
    .filter((date): date is Date => date !== null);
  const amounts = [...new Set(validTransactions.map((transaction) => transaction.amount))]
    .filter((amount): amount is number => amount !== null);
  const histories = dates.length > 0 && amounts.length > 0
    ? await prisma.paymentHistory.findMany({
        where: { userId: user.id, paidAt: { in: dates }, amount: { in: amounts } },
        select: { subscriptionId: true, amount: true, paidAt: true },
      })
    : [];

  const groups = new Map<string, typeof validTransactions>();
  for (const transaction of validTransactions) {
    const key = `${transaction.merchant}-${transaction.amount}`;
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }
  const candidates = [...groups.values()].map((items) => {
    const first = items[0];
    const known = knownServices.find((service) =>
      first.merchant.includes(normalizeStatementMerchant(service)),
    );
    const itemDates = items
      .map((item) => parseIsoCalendarDate(item.paidAt ?? ""))
      .filter((date): date is Date => date !== null);
    const cycle = inferCycle(itemDates);
    const recurring = items.length >= CSV_RECURRING_MIN_OCCURRENCES || cycle !== "UNKNOWN";
    const aliasedSubscriptionId = aliasedSubscriptionIdByMerchant.get(first.merchant);
    const aliasedSubscription = aliasedSubscriptionId
      ? subscriptions.find((subscription) => subscription.id === aliasedSubscriptionId)
      : undefined;
    const existing = aliasedSubscription ?? subscriptions.find((subscription) => {
      const name = normalizeStatementMerchant(subscription.name);
      return first.merchant.includes(name) || name.includes(first.merchant);
    });
    const priceNearExisting = subscriptions.some((subscription) =>
      Math.abs(subscription.price - (first.amount ?? 0)) <= CSV_EXISTING_PRICE_TOLERANCE,
    );
    const confidence = Math.min(
      CSV_MAX_CONFIDENCE,
      (known ? CSV_CONFIDENCE_WEIGHTS.knownMerchant : 0)
        + (recurring ? CSV_CONFIDENCE_WEIGHTS.recurringCycle : 0)
        + (items.length >= CSV_RECURRING_OCCURRENCE_THRESHOLD ? CSV_CONFIDENCE_WEIGHTS.enoughOccurrences : 0)
        + (existing || priceNearExisting ? CSV_CONFIDENCE_WEIGHTS.alreadyRegistered : 0)
        + (itemDates.length ? CSV_CONFIDENCE_WEIGHTS.hasDates : 0),
    );
    const sortedDates = [...itemDates].sort((left, right) => left.getTime() - right.getTime());
    const billingCycle = candidateBillingCycle(cycle);
    return {
      name: existing?.name ?? known ?? first.merchant,
      merchant: first.merchant,
      amount: first.amount ?? 0,
      occurrences: items.length,
      firstDate: isoDate(sortedDates[0]),
      lastDate: isoDate(sortedDates.at(-1)),
      confidence,
      reason: [
        known ? "有名サービス名を検出" : "同一明細を検出",
        recurring ? cycleLabel(cycle) : "単発の可能性あり",
        aliasedSubscription ? "保存済み明細名義" : existing ? "登録済み" : "未登録候補",
      ].join(" / "),
      billingCycle,
      nextBillingDate: candidateNextBillingDate(sortedDates.at(-1), billingCycle),
      existingSubscriptionId: existing?.id ?? null,
    };
  }).filter((item) => item.confidence >= CSV_MIN_CANDIDATE_CONFIDENCE)
    .sort((left, right) => right.confidence - left.confidence || right.occurrences - left.occurrences)
    .slice(0, CSV_MAX_CANDIDATE_COUNT);

  const paymentMatches = buildStatementPaymentMatches(
    parsed.transactions,
    subscriptions,
    histories,
    merchantAliases,
  );
  return NextResponse.json({
    candidates,
    totalRows: parsed.totalRows,
    detected: candidates.length,
    paymentMatches,
    subscriptionOptions: subscriptions.map(({ id, name, status }) => ({ id, name, status })),
  }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
