import assert from "node:assert/strict";
import test from "node:test";
import {
  scheduledPriceDateAllowed,
  scheduledPriceDifference,
  scheduledPriceInputSchema,
  scheduledPriceNoticeDue,
} from "./scheduled-price.ts";

const now = new Date("2026-08-30T03:00:00.000Z");

test("価格と変更予定日を検証する", () => {
  assert.equal(scheduledPriceInputSchema.safeParse({ price: 1_500, effectiveAt: "2026-09-01" }).success, true);
  assert.equal(scheduledPriceInputSchema.safeParse({ price: -1, effectiveAt: "2026-09-01" }).success, false);
  assert.equal(scheduledPriceInputSchema.safeParse({ price: 1_500.5, effectiveAt: "2026-09-01" }).success, false);
  assert.equal(scheduledPriceInputSchema.safeParse({ price: 1_500, effectiveAt: "2026-02-30" }).success, false);
});

test("当日以降だけを変更予定日にできる", () => {
  assert.equal(scheduledPriceDateAllowed(new Date("2026-08-30T00:00:00.000Z"), now), true);
  assert.equal(scheduledPriceDateAllowed(new Date("2026-08-29T00:00:00.000Z"), now), false);
});

test("通知日数以内に入った未来日と当日を通知対象にする", () => {
  assert.equal(scheduledPriceNoticeDue(new Date("2026-09-06T00:00:00.000Z"), 7, now), true);
  assert.equal(scheduledPriceNoticeDue(new Date("2026-09-07T00:00:00.000Z"), 7, now), false);
  assert.equal(scheduledPriceNoticeDue(new Date("2026-08-30T00:00:00.000Z"), 7, now), true);
  assert.equal(scheduledPriceNoticeDue(new Date("2026-08-29T00:00:00.000Z"), 7, now), false);
});

test("値上げ・値下げ・同額の差額を符号付きで返す", () => {
  assert.equal(scheduledPriceDifference(1_000, 1_500), 500);
  assert.equal(scheduledPriceDifference(1_000, 800), -200);
  assert.equal(scheduledPriceDifference(1_000, 1_000), 0);
});
