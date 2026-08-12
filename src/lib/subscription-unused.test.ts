import assert from "node:assert/strict";
import test from "node:test";
import { detectUnusedSubscriptions } from "./subscription-unused.ts";

test("登録直後の契約を未使用と判定しない", () => {
  const now = new Date("2026-08-10T00:00:00.000Z");
  const results = detectUnusedSubscriptions([{ id: "new", name: "新規", createdAt: new Date("2026-08-01T00:00:00.000Z"), usageDays30: 0, usageDays60: 0, usageDays90: 0 }], now);

  assert.deepEqual(results, []);
});

test("最長の未使用期間を優先して返す", () => {
  const now = new Date("2026-08-10T00:00:00.000Z");
  const results = detectUnusedSubscriptions([{ id: "old", name: "既存", createdAt: new Date("2026-05-01T00:00:00.000Z"), usageDays30: 0, usageDays60: 0, usageDays90: 0 }], now);

  assert.equal(results[0]?.unusedDays, 90);
});
