import assert from "node:assert/strict";
import test from "node:test";
import {
  subscriptionFieldErrorDetails,
  subscriptionFieldErrorMessage,
  subscriptionValidationDetails,
  validateRequiredSubscriptionFields,
} from "./subscription-form-errors.ts";

test("複数の検証エラーを項目名付きの日本語応答へ変換する", () => {
  const result = subscriptionValidationDetails([
    { path: ["name"] },
    { path: ["nextBillingDate"] },
    { path: ["businessUsePercent"] },
  ]);
  assert.equal(result.message, "入力内容を確認してください: サービス名、次回更新日、仕事利用割合");
  assert.match(result.fieldErrors.name?.[0] ?? "", /サービス名/);
  assert.match(result.fieldErrors.nextBillingDate?.[0] ?? "", /次回更新日/);
});

test("同じ項目の複数issueを一つの表示へまとめる", () => {
  const result = subscriptionValidationDetails([
    { path: ["price"] },
    { path: ["price"] },
  ]);
  assert.equal(result.fieldErrors.price?.length, 1);
});

test("項目を特定できないissueは一般メッセージだけを返す", () => {
  const result = subscriptionValidationDetails([{ path: [] }, { path: ["unknown"] }]);
  assert.equal(result.message, "入力内容を確認してください。");
  assert.deepEqual(result.fieldErrors, {});
});

test("条件付き必須項目へ専用メッセージを設定できる", () => {
  const result = subscriptionFieldErrorDetails(
    "customCycleDays",
    "カスタム請求では周期日数が必要です。",
  );
  assert.equal(result.message, "入力内容を確認してください: カスタム周期（日数）");
  assert.deepEqual(result.fieldErrors.customCycleDays, ["カスタム請求では周期日数が必要です。"]);
});

test("登録前に必須項目と数値範囲をまとめて検出する", () => {
  const errors = validateRequiredSubscriptionFields({
    name: " ",
    price: "-1",
    billingCycle: "CUSTOM",
    customCycleDays: "",
    nextBillingDate: "",
    businessUsePercent: "101",
  });
  assert.deepEqual(Object.keys(errors), [
    "name",
    "price",
    "nextBillingDate",
    "businessUsePercent",
    "customCycleDays",
  ]);
  assert.match(subscriptionFieldErrorMessage(errors), /サービス名.*料金.*次回更新日/);
});

test("有効な必須項目では登録前エラーを返さない", () => {
  const errors = validateRequiredSubscriptionFields({
    name: "Netflix",
    price: "1490",
    billingCycle: "MONTHLY",
    customCycleDays: "",
    nextBillingDate: "2026-09-03",
    businessUsePercent: "0",
  });
  assert.deepEqual(errors, {});
});

test("外貨請求では原通貨額と円換算レートの不足項目を特定する", () => {
  const errors = validateRequiredSubscriptionFields({
    name: "海外SaaS",
    price: "1500",
    billingCycle: "MONTHLY",
    customCycleDays: "",
    nextBillingDate: "2026-09-03",
    businessUsePercent: "100",
    currency: "USD",
    sourceAmount: "",
    exchangeRateToJpy: "150",
  });
  assert.deepEqual(Object.keys(errors), ["sourceAmount"]);
  assert.match(subscriptionFieldErrorMessage(errors), /原通貨の請求額/);
});
