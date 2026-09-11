import assert from "node:assert/strict";
import test from "node:test";
import {
  billingOccurrencesInRange,
  daysUntil,
  nextBillingOccurrence,
} from "./billing.ts";

test("未来の請求日は変更しない", () => {
  const due = new Date("2026-09-10T00:00:00.000Z");
  assert.equal(nextBillingOccurrence(due, "MONTHLY", null, new Date("2026-08-27T00:00:00.000Z")).getTime(), due.getTime());
});

test("月末請求は元の請求日をアンカーに繰り越す", () => {
  const occurrence = nextBillingOccurrence(new Date("2026-01-31T00:00:00.000Z"), "MONTHLY", null, new Date("2026-03-01T00:00:00.000Z"));
  assert.equal(occurrence.toISOString().slice(0, 10), "2026-03-31");
});

test("うるう日の年次請求を平年の月末へ丸める", () => {
  const occurrence = nextBillingOccurrence(new Date("2024-02-29T00:00:00.000Z"), "YEARLY", null, new Date("2025-02-01T00:00:00.000Z"));
  assert.equal(occurrence.toISOString().slice(0, 10), "2025-02-28");
});

test("週次と任意周期を参照日以降へ繰り越す", () => {
  assert.equal(nextBillingOccurrence(new Date("2026-08-01T00:00:00.000Z"), "WEEKLY", null, new Date("2026-08-27T00:00:00.000Z")).toISOString().slice(0, 10), "2026-08-29");
  assert.equal(nextBillingOccurrence(new Date("2026-08-01T00:00:00.000Z"), "CUSTOM", 10, new Date("2026-08-27T00:00:00.000Z")).toISOString().slice(0, 10), "2026-08-31");
});

test("残日数は指定した基準日から計算する", () => {
  assert.equal(daysUntil(new Date("2026-08-31T00:00:00.000Z"), new Date("2026-08-27T00:00:00.000Z")), 4);
});

test("月内の週次請求をすべて列挙する", () => {
  const occurrences = billingOccurrencesInRange(
    new Date("2026-08-01T00:00:00.000Z"),
    "WEEKLY",
    null,
    new Date("2026-08-01T00:00:00.000Z"),
    new Date("2026-09-01T00:00:00.000Z"),
  );
  assert.deepEqual(
    occurrences.map((item) => item.toISOString().slice(0, 10)),
    ["2026-08-01", "2026-08-08", "2026-08-15", "2026-08-22", "2026-08-29"],
  );
});

test("月末アンカーを維持して対象月の請求を列挙する", () => {
  const occurrences = billingOccurrencesInRange(
    new Date("2026-01-31T00:00:00.000Z"),
    "MONTHLY",
    null,
    new Date("2026-02-01T00:00:00.000Z"),
    new Date("2026-04-01T00:00:00.000Z"),
  );
  assert.deepEqual(
    occurrences.map((item) => item.toISOString().slice(0, 10)),
    ["2026-02-28", "2026-03-31"],
  );
});

test("31日アンカーの月額請求は短い月の末日へ寄せ、翌月には元の日付へ戻る", () => {
  const occurrences = billingOccurrencesInRange(
    new Date("2024-01-31T00:00:00.000Z"),
    "MONTHLY",
    null,
    new Date("2024-01-01T00:00:00.000Z"),
    new Date("2024-06-01T00:00:00.000Z"),
  );
  assert.deepEqual(
    occurrences.map((item) => item.toISOString().slice(0, 10)),
    ["2024-01-31", "2024-02-29", "2024-03-31", "2024-04-30", "2024-05-31"],
  );
});

test("3か月・6か月周期は日数ではなく暦月アンカーで月末とうるう日を扱う", () => {
  const quarterly = billingOccurrencesInRange(
    new Date("2023-08-31T00:00:00.000Z"),
    "QUARTERLY",
    null,
    new Date("2023-08-01T00:00:00.000Z"),
    new Date("2024-07-01T00:00:00.000Z"),
  );
  const semiannual = billingOccurrencesInRange(
    new Date("2023-08-31T00:00:00.000Z"),
    "SEMIANNUAL",
    null,
    new Date("2023-08-01T00:00:00.000Z"),
    new Date("2025-03-01T00:00:00.000Z"),
  );
  assert.deepEqual(
    quarterly.map((item) => item.toISOString().slice(0, 10)),
    ["2023-08-31", "2023-11-30", "2024-02-29", "2024-05-31"],
  );
  assert.deepEqual(
    semiannual.map((item) => item.toISOString().slice(0, 10)),
    ["2023-08-31", "2024-02-29", "2024-08-31", "2025-02-28"],
  );
});

test("対象期間外の請求と不正な期間は返さない", () => {
  assert.deepEqual(
    billingOccurrencesInRange(
      new Date("2027-01-01T00:00:00.000Z"),
      "YEARLY",
      null,
      new Date("2026-08-01T00:00:00.000Z"),
      new Date("2026-09-01T00:00:00.000Z"),
    ),
    [],
  );
  assert.deepEqual(
    billingOccurrencesInRange(
      new Date("2026-08-01T00:00:00.000Z"),
      "MONTHLY",
      null,
      new Date("2026-09-01T00:00:00.000Z"),
      new Date("2026-08-01T00:00:00.000Z"),
    ),
    [],
  );
});
