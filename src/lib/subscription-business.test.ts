import assert from "node:assert/strict";
import test from "node:test";
import {
  businessUseAmount,
  businessUseLabel,
  normalizeBusinessUsePercent,
} from "./subscription-business.ts";

test("仕事利用割合を0から100に収める", () => {
  assert.equal(normalizeBusinessUsePercent(-10), 0);
  assert.equal(normalizeBusinessUsePercent(52.6), 53);
  assert.equal(normalizeBusinessUsePercent(120), 100);
});

test("仕事利用分を割合から円単位で算出する", () => {
  assert.equal(businessUseAmount(1_980, 50), 990);
  assert.equal(businessUseAmount(1_000, 33), 330);
});

test("仕事利用割合に応じた表示名を返す", () => {
  assert.equal(businessUseLabel(0), "個人利用");
  assert.equal(businessUseLabel(100), "仕事利用");
  assert.equal(businessUseLabel(60), "仕事・個人兼用（仕事 60%）");
});
