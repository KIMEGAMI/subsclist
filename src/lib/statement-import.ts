import {
  CSV_MAX_CONFIDENCE,
  MAX_CSV_IMPORT_ROWS,
  MAX_SUBSCRIPTION_PRICE,
} from "./app-constants.ts";
import { parseIsoCalendarDate } from "./calendar-date.ts";
import { parseCsvRows } from "./csv.ts";

const merchantHeaders = [
  "摘要", "内容", "明細", "利用店名", "加盟店名", "ご利用店名", "ご利用先", "お支払先", "取引内容", "備考", "メモ",
  "description", "merchant", "name", "details",
] as const;
const amountHeaders = [
  "金額", "利用金額", "ご利用金額", "請求金額", "支払金額", "出金", "引落金額", "amount", "price", "debit",
] as const;
const dateHeaders = [
  "日付", "利用日", "ご利用日", "取引日", "引落日", "請求日", "date", "transactiondate",
] as const;

export type StatementTransaction = {
  rowNumber: number;
  rawMerchant: string;
  merchant: string;
  amount: number | null;
  paidAt: string | null;
  issues: string[];
};

export type StatementSubscription = {
  id: string;
  name: string;
  price: number;
};

export type StatementPaymentHistory = {
  subscriptionId: string;
  amount: number;
  paidAt: Date;
};

export type StatementMerchantAlias = {
  subscriptionId: string;
  normalizedMerchant: string;
};

export type StatementPaymentMatch = {
  rowNumber: number;
  merchant: string;
  amount: number | null;
  paidAt: string | null;
  suggestedSubscriptionId: string | null;
  confidence: number;
  reason: string;
  duplicate: boolean;
  issues: string[];
};

function normalizedHeader(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ja-JP").replace(/[\s　_\-（）()]/g, "");
}

function valueFor(row: Record<string, string>, candidates: readonly string[]) {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizedHeader(key), value]),
  );
  for (const candidate of candidates) {
    const value = normalized[normalizedHeader(candidate)];
    if (value?.trim()) return value.trim();
  }
  return "";
}

export function normalizeStatementMerchant(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .replace(/[0-9]+/g, " ")
    .replace(/[*#\-_/\\()[\]（）【】「」『』・,，.．:：]/g, " ")
    .replace(/(ｶﾌﾞ|ｶ\)|株式会社|有限会社|合同会社|利用|決済|カード|ご利用)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAmount(value: string): number | null {
  const normalized = value.replace(/[￥¥円,，\s]/g, "").replace(/[▲△−－]/g, "-");
  const amount = Math.abs(Number(normalized));
  return Number.isInteger(amount) && amount > 0 && amount <= MAX_SUBSCRIPTION_PRICE
    ? amount
    : null;
}

function parseDate(value: string): string | null {
  const matched = value
    .normalize("NFKC")
    .trim()
    .match(/^(\d{4})[年/.\-](\d{1,2})[月/.\-](\d{1,2})日?$/);
  if (!matched) return null;
  const iso = `${matched[1]}-${matched[2].padStart(2, "0")}-${matched[3].padStart(2, "0")}`;
  return parseIsoCalendarDate(iso) ? iso : null;
}

export function parseStatementCsv(text: string) {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  const [headers, ...body] = rows;
  if (!headers || body.length === 0) throw new Error("CSVに解析する行がありません。");
  if (body.length > MAX_CSV_IMPORT_ROWS) throw new Error(`CSVは${MAX_CSV_IMPORT_ROWS}行以下にしてください。`);

  const transactions = body.map((cells, index): StatementTransaction => {
    const row = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] ?? ""]));
    const rawMerchant = valueFor(row, merchantHeaders);
    const merchant = normalizeStatementMerchant(rawMerchant);
    const amount = parseAmount(valueFor(row, amountHeaders));
    const paidAt = parseDate(valueFor(row, dateHeaders));
    const issues = [
      !merchant ? "利用店名・摘要を確認してください。" : null,
      amount === null ? "金額を1円以上の整数で入力してください。" : null,
      paidAt === null ? "利用日を正しい日付で入力してください。" : null,
    ].filter((issue): issue is string => Boolean(issue));
    return { rowNumber: index + 2, rawMerchant, merchant, amount, paidAt, issues };
  });
  return { totalRows: body.length, transactions };
}

function namesMatch(merchant: string, subscriptionName: string) {
  const name = normalizeStatementMerchant(subscriptionName);
  return merchant.length >= 3 && name.length >= 3
    && (merchant.includes(name) || name.includes(merchant));
}

function historyKey(subscriptionId: string, paidAt: string, amount: number) {
  return `${subscriptionId}\n${paidAt}\n${amount}`;
}

export function buildStatementPaymentMatches(
  transactions: StatementTransaction[],
  subscriptions: StatementSubscription[],
  histories: StatementPaymentHistory[],
  merchantAliases: StatementMerchantAlias[] = [],
): StatementPaymentMatch[] {
  const existingKeys = new Set(histories.map((history) => historyKey(
    history.subscriptionId,
    history.paidAt.toISOString().slice(0, 10),
    history.amount,
  )));
  const fileKeys = new Set<string>();

  return transactions.map((transaction) => {
    if (transaction.issues.length > 0 || transaction.amount === null || !transaction.paidAt) {
      return {
        rowNumber: transaction.rowNumber,
        merchant: transaction.rawMerchant || transaction.merchant,
        amount: transaction.amount,
        paidAt: transaction.paidAt,
        suggestedSubscriptionId: null,
        confidence: 0,
        reason: "明細の入力内容を確認してください。",
        duplicate: false,
        issues: transaction.issues,
      };
    }

    const aliasSubscriptionIds = new Set(
      merchantAliases
        .filter((alias) => alias.normalizedMerchant === transaction.merchant)
        .map((alias) => alias.subscriptionId),
    );
    const aliasedSubscription = aliasSubscriptionIds.size === 1
      ? subscriptions.find((subscription) => aliasSubscriptionIds.has(subscription.id))
      : undefined;
    const ranked = subscriptions.map((subscription) => {
      const nameMatch = namesMatch(transaction.merchant, subscription.name);
      const difference = Math.abs(subscription.price - transaction.amount!);
      const amountScore = difference === 0 ? 25 : difference <= 100 ? 10 : 0;
      return {
        subscription,
        nameMatch,
        score: (nameMatch ? 70 : 0) + amountScore,
        difference,
      };
    }).sort((left, right) => right.score - left.score || left.difference - right.difference);
    const first = ranked[0];
    const second = ranked[1];
    const unambiguous = Boolean(first && first.nameMatch && first.score > (second?.score ?? -1));
    const suggested = aliasedSubscription ?? (unambiguous ? first.subscription : null);
    const key = suggested ? historyKey(suggested.id, transaction.paidAt, transaction.amount) : null;
    const duplicate = Boolean(key && (existingKeys.has(key) || fileKeys.has(key)));
    if (key) fileKeys.add(key);

    return {
      rowNumber: transaction.rowNumber,
      merchant: transaction.rawMerchant || transaction.merchant,
      amount: transaction.amount,
      paidAt: transaction.paidAt,
      suggestedSubscriptionId: suggested?.id ?? null,
      confidence: aliasedSubscription
        ? CSV_MAX_CONFIDENCE
        : suggested ? first.score : 0,
      reason: aliasedSubscription
        ? `${aliasedSubscription.name}の保存済み明細名義と一致`
        : suggested
        ? `${suggested.name}と名称${first.difference === 0 ? "・金額" : ""}が一致`
        : "契約を自動特定できませんでした。手動で選択してください。",
      duplicate,
      issues: duplicate ? ["同じ契約・支払日・金額の履歴が既にあります。"] : [],
    };
  });
}

export function duplicateStatementPaymentKeys(items: Array<{
  subscriptionId: string;
  paidAt: string;
  amount: number;
}>) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) {
    const key = historyKey(item.subscriptionId, item.paidAt, item.amount);
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return duplicates;
}
