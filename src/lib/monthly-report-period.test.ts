import assert from "node:assert/strict";
import test from "node:test";
import { resolveMonthlyReportPeriod, shiftMonthlyReportKey } from "./monthly-report-period.ts";

const now = new Date("2026-08-31T15:30:00.000Z");

test("未指定時は日本時間の現在月を選択する", () => {
  const period = resolveMonthlyReportPeriod(undefined, now);
  assert.equal(period.key, "2026-09");
  assert.equal(period.isCurrent, true);
  assert.equal(period.start.toISOString(), "2026-09-01T00:00:00.000Z");
});

test("過去月は選択し未来月と不正値は現在月へ戻す", () => {
  assert.equal(resolveMonthlyReportPeriod("2026-08", now).key, "2026-08");
  assert.equal(resolveMonthlyReportPeriod("2026-10", now).key, "2026-09");
  assert.equal(resolveMonthlyReportPeriod("1999-12", now).key, "2026-09");
  assert.equal(resolveMonthlyReportPeriod("2026-13", now).key, "2026-09");
});

test("年境界をまたいで前月と翌月を移動する", () => {
  assert.equal(shiftMonthlyReportKey("2026-01", -1), "2025-12");
  assert.equal(shiftMonthlyReportKey("2026-12", 1), "2027-01");
});
