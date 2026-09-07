import assert from "node:assert/strict";
import test from "node:test";
import { CSV_MAX_CONFIDENCE } from "./app-constants.ts";
import {
  buildStatementPaymentMatches,
  duplicateStatementPaymentKeys,
  normalizeStatementMerchant,
  parseStatementCsv,
} from "./statement-import.ts";

test("日本語と英語の明細ヘッダを読み取り行番号を保持する", () => {
  const parsed = parseStatementCsv([
    "利用日,摘要,金額",
    '2026/8/1,NETFLIX.COM,"1,490"',
  ].join("\n"));
  assert.equal(parsed.totalRows, 1);
  assert.equal(parsed.transactions[0]?.rowNumber, 2);
  assert.equal(parsed.transactions[0]?.merchant, "netflix com");
  assert.equal(parsed.transactions[0]?.amount, 1490);

  const english = parseStatementCsv("date,merchant,amount\n2026-08-02,Adobe,6480");
  assert.equal(english.transactions[0]?.paidAt, "2026-08-02");
  assert.equal(english.transactions[0]?.amount, 6480);
});

test("存在しない日付・小数金額・空の摘要を項目別に拒否する", () => {
  const parsed = parseStatementCsv("利用日,摘要,金額\n2026-02-30,,980.5");
  assert.deepEqual(parsed.transactions[0]?.issues, [
    "利用店名・摘要を確認してください。",
    "金額を1円以上の整数で入力してください。",
    "利用日を正しい日付で入力してください。",
  ]);
});

test("明細表記をNFKCで正規化し法人・決済表記と番号を除去する", () => {
  assert.equal(normalizeStatementMerchant("株式会社 ＡＤＯＢＥ＊１２３ 決済"), "adobe");
});

test("名称と金額が一意に一致する契約を高信頼度で提案する", () => {
  const transactions = parseStatementCsv("利用日,摘要,金額\n2026-08-01,NETFLIX.COM,1490").transactions;
  const matches = buildStatementPaymentMatches(transactions, [
    { id: "netflix", name: "Netflix", price: 1490 },
    { id: "other", name: "動画サービス", price: 1490 },
  ], []);
  assert.equal(matches[0]?.suggestedSubscriptionId, "netflix");
  assert.equal(matches[0]?.confidence, 95);
  assert.equal(matches[0]?.duplicate, false);
});

test("金額だけの一致や複数の名称一致を自動確定しない", () => {
  const amountOnly = parseStatementCsv("利用日,摘要,金額\n2026-08-01,UNKNOWN SHOP,980").transactions;
  assert.equal(buildStatementPaymentMatches(amountOnly, [
    { id: "one", name: "Service One", price: 980 },
  ], [])[0]?.suggestedSubscriptionId, null);

  const ambiguous = parseStatementCsv("利用日,摘要,金額\n2026-08-01,Google,980").transactions;
  assert.equal(buildStatementPaymentMatches(ambiguous, [
    { id: "one", name: "Google", price: 980 },
    { id: "two", name: "Google One", price: 980 },
  ], [])[0]?.suggestedSubscriptionId, null);
});

test("保存済み明細名義は名称や金額が異なっても優先提案する", () => {
  const transactions = parseStatementCsv("利用日,摘要,金額\n2026-08-01,OPENAI*CHATGPT,3200").transactions;
  const matches = buildStatementPaymentMatches(
    transactions,
    [{ id: "chatgpt", name: "ChatGPT Plus", price: 3000 }],
    [],
    [{ subscriptionId: "chatgpt", normalizedMerchant: "openai chatgpt" }],
  );
  assert.equal(matches[0]?.suggestedSubscriptionId, "chatgpt");
  assert.equal(matches[0]?.confidence, CSV_MAX_CONFIDENCE);
  assert.match(matches[0]?.reason ?? "", /保存済み明細名義/);
});

test("同じ名義が複数契約へ壊れて保存されている場合は自動提案しない", () => {
  const transactions = parseStatementCsv("利用日,摘要,金額\n2026-08-01,APPLE.COM/BILL,980").transactions;
  const matches = buildStatementPaymentMatches(
    transactions,
    [
      { id: "one", name: "Music", price: 980 },
      { id: "two", name: "Storage", price: 980 },
    ],
    [],
    [
      { subscriptionId: "one", normalizedMerchant: "apple com bill" },
      { subscriptionId: "two", normalizedMerchant: "apple com bill" },
    ],
  );
  assert.equal(matches[0]?.suggestedSubscriptionId, null);
});

test("DBとCSV内の同一契約・日付・金額を重複として扱う", () => {
  const transactions = parseStatementCsv([
    "利用日,摘要,金額",
    "2026-08-01,Netflix,1490",
    "2026-08-01,Netflix,1490",
  ].join("\n")).transactions;
  const subscription = { id: "netflix", name: "Netflix", price: 1490 };
  const databaseDuplicate = buildStatementPaymentMatches(
    transactions.slice(0, 1),
    [subscription],
    [{ subscriptionId: "netflix", amount: 1490, paidAt: new Date("2026-08-01T00:00:00.000Z") }],
  );
  assert.equal(databaseDuplicate[0]?.duplicate, true);

  const fileDuplicate = buildStatementPaymentMatches(transactions, [subscription], []);
  assert.equal(fileDuplicate[0]?.duplicate, false);
  assert.equal(fileDuplicate[1]?.duplicate, true);
  assert.equal(duplicateStatementPaymentKeys([
    { subscriptionId: "netflix", amount: 1490, paidAt: "2026-08-01" },
    { subscriptionId: "netflix", amount: 1490, paidAt: "2026-08-01" },
  ]).size, 1);
});
