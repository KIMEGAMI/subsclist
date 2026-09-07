import assert from "node:assert/strict";
import test from "node:test";
import { isFutureMonthlyExportPeriod, monthlyExportPeriod } from "./monthly-export-period.ts";

test("指定年月をUTC暦日の開始と翌月開始へ変換する", () => {
  assert.deepEqual(monthlyExportPeriod(2026, 12), {
    start: new Date("2026-12-01T00:00:00.000Z"),
    end: new Date("2027-01-01T00:00:00.000Z"),
  });
});

test("日本時間の年月より未来だけを出力不可と判定する", () => {
  const now = new Date("2026-08-31T15:30:00.000Z");
  assert.equal(isFutureMonthlyExportPeriod(2026, 9, now), false);
  assert.equal(isFutureMonthlyExportPeriod(2026, 10, now), true);
  assert.equal(isFutureMonthlyExportPeriod(2025, 12, now), false);
});
