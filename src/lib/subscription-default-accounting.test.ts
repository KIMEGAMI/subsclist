import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultAccountingLabelSchema,
  normalizeDefaultAccountingLabel,
  rememberAccountingLabelSchema,
} from "./subscription-default-accounting.ts";

test("整理用初期科目は前後空白を除いて保存する", () => {
  const parsed = defaultAccountingLabelSchema.parse("  通信費  ");
  assert.equal(normalizeDefaultAccountingLabel(parsed), "通信費");
});

test("空の整理用初期科目は未設定として扱う", () => {
  assert.equal(normalizeDefaultAccountingLabel("  "), null);
});

test("整理用初期科目は100文字を超える入力を拒否する", () => {
  assert.equal(defaultAccountingLabelSchema.safeParse("a".repeat(101)).success, false);
});

test("次回も使用する指定はbooleanまたはフォーム値だけを許可する", () => {
  assert.equal(rememberAccountingLabelSchema.parse("true"), true);
  assert.equal(rememberAccountingLabelSchema.parse("false"), false);
  assert.equal(rememberAccountingLabelSchema.safeParse("yes").success, false);
});
