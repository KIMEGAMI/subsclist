import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStatementMerchantAliasWrites,
  statementMerchantAliasData,
} from "./statement-merchant-alias.ts";

test("明細名義を表示用と照合用へ正規化する", () => {
  assert.deepEqual(statementMerchantAliasData("  株式会社 ＯＰＥＮＡＩ＊123  "), {
    merchantLabel: "株式会社 OPENAI*123",
    normalizedMerchant: "openai",
  });
});

test("短すぎる名義と長すぎる名義を保存しない", () => {
  assert.equal(statementMerchantAliasData("AB"), null);
  assert.equal(statementMerchantAliasData("a".repeat(192)), null);
});

test("明示された名義だけを重複なく保存候補へまとめる", () => {
  const result = buildStatementMerchantAliasWrites([
    { subscriptionId: "sub-1", merchant: "OPENAI*123", rememberMerchantAlias: true },
    { subscriptionId: "sub-1", merchant: "OPENAI*456", rememberMerchantAlias: true },
    { subscriptionId: "sub-2", merchant: "NETFLIX.COM", rememberMerchantAlias: false },
  ]);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.aliases.map((item) => item.normalizedMerchant), ["openai"]);
});

test("同じ名義を複数契約へ記憶する入力を拒否する", () => {
  const result = buildStatementMerchantAliasWrites([
    { subscriptionId: "sub-1", merchant: "APPLE.COM/BILL", rememberMerchantAlias: true },
    { subscriptionId: "sub-2", merchant: "APPLE.COM BILL", rememberMerchantAlias: true },
  ]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /複数の契約/);
});
