import assert from "node:assert/strict";
import test from "node:test";
import {
  candidateBillingCycle,
  candidateNextBillingDate,
} from "./csv-candidate.ts";

test("候補の不明・独自周期は確認しやすい月額へ寄せる", () => {
  assert.equal(candidateBillingCycle("UNKNOWN"), "MONTHLY");
  assert.equal(candidateBillingCycle("CUSTOM"), "MONTHLY");
  assert.equal(candidateBillingCycle("YEARLY"), "YEARLY");
});

test("最終支払日から次回の月次・週次請求日を推定する", () => {
  assert.equal(
    candidateNextBillingDate(new Date("2026-01-31T00:00:00.000Z"), "MONTHLY"),
    "2026-02-28",
  );
  assert.equal(
    candidateNextBillingDate(new Date("2026-08-01T00:00:00.000Z"), "WEEKLY"),
    "2026-08-08",
  );
});

test("支払日がなければ推定日を返さない", () => {
  assert.equal(candidateNextBillingDate(undefined, "MONTHLY"), "");
});
