import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSubscriptionImportPreview,
  parseSubscriptionCsvImport,
  SUBSCRIPTION_IMPORT_HEADERS,
} from "./subscription-csv-import.ts";

test("ヘッダ付きCSVを正規化し、保存可能なデータへ変換する", () => {
  const csv = `${SUBSCRIPTION_IMPORT_HEADERS.join(",")}\n海外SaaS,1490,月額,2026/09/03,仕事,,https://service.example/,,, ,100,DIRECT,USD,9.99,149.1491,2026-08-31,通信費`;
  const result = parseSubscriptionCsvImport(csv);
  assert.equal(result.hasHeader, true);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0]?.issues, []);
  assert.equal(result.rows[0]?.data?.billingCycle, "MONTHLY");
  assert.equal(result.rows[0]?.data?.sourceAmountMinor, 999);
  assert.equal(result.rows[0]?.data?.defaultAccountingLabel, "通信費");
  assert.equal(result.rows[0]?.values.次回更新日, "2026-09-03");
});

test("ヘッダなしの旧12列CSVをJPYとして後方互換で解析する", () => {
  const result = parseSubscriptionCsvImport(
    ["Netflix", "1490", "MONTHLY", "2026-09-03", "動画", "カード", "https://netflix.example/", "", "", "", "0", "DIRECT"].join(","),
  );
  assert.equal(result.hasHeader, false);
  assert.equal(result.rows[0]?.data?.currency, "JPY");
  assert.equal(result.rows[0]?.data?.sourceAmountMinor, null);
  assert.equal(result.rows[0]?.data?.billingProvider, "DIRECT");
  assert.equal(result.rows[0]?.data?.defaultAccountingLabel, null);
});

test("整理用初期科目が100文字を超える行を保存対象にしない", () => {
  const row = ["SaaS", "1000", "MONTHLY", "2026-09-03", "", "", "", "", "", "", "0", "DIRECT", "JPY", "", "", "", "a".repeat(101)].join(",");
  const result = parseSubscriptionCsvImport(`${SUBSCRIPTION_IMPORT_HEADERS.join(",")}\n${row}`);
  assert.equal(result.rows[0]?.data, null);
  assert.match(result.rows[0]?.issues.join(" ") ?? "", /整理用初期科目/);
});

test("不正な項目を行番号と日本語の複数理由で返す", () => {
  const result = parseSubscriptionCsvImport(
    `${SUBSCRIPTION_IMPORT_HEADERS.join(",")}\n,abc,UNKNOWN,2026-02-30,,,,javascript:alert(1),,,,,USD,,,`,
  );
  const row = result.rows[0];
  assert.equal(row?.rowNumber, 2);
  assert.equal(row?.data, null);
  assert.ok((row?.issues.length ?? 0) >= 4);
  assert.match(row?.issues.join(" ") ?? "", /サービス名/);
  assert.match(row?.issues.join(" ") ?? "", /解約URL/);
});

test("外貨では原通貨額とレート不足を個別に返す", () => {
  const result = parseSubscriptionCsvImport(
    `${SUBSCRIPTION_IMPORT_HEADERS.join(",")}\n${["SaaS", "1500", "MONTHLY", "2026-09-03", "", "", "", "", "", "", "0", "DIRECT", "USD", "", "", ""].join(",")}`,
  );
  assert.match(result.rows[0]?.issues.join(" ") ?? "", /原通貨/);
});

test("既存契約・CSV内重複・未登録支払い方法を保存前に検出する", () => {
  const headers = SUBSCRIPTION_IMPORT_HEADERS.join(",");
  const first = ["既存SaaS", "1000", "MONTHLY", "2026-09-03", "", "登録済みカード", "", "", "", "", "0", "DIRECT", "JPY", "", "", ""].join(",");
  const second = ["新規SaaS", "2000", "MONTHLY", "2026-09-04", "", "未登録カード", "", "", "", "", "0", "DIRECT", "JPY", "", "", ""].join(",");
  const third = ["新規SaaS", "3000", "MONTHLY", "2026-09-05", "", "登録済みカード", "", "", "", "", "0", "DIRECT", "JPY", "", "", ""].join(",");
  const parsed = parseSubscriptionCsvImport(`${headers}\n${first}\n${second}\n${third}`);
  const preview = buildSubscriptionImportPreview({
    rows: parsed.rows,
    existingSubscriptionNames: ["既存ＳａａＳ"],
    availablePaymentMethodNames: ["登録済みカード"],
  });
  assert.match(preview[0]?.issues.join(" ") ?? "", /既に登録/);
  assert.match(preview[1]?.issues.join(" ") ?? "", /支払い方法/);
  assert.match(preview[2]?.issues.join(" ") ?? "", /CSV内で重複/);
  assert.equal(preview.every((row) => !row.selected), true);
});
