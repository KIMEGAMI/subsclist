import assert from "node:assert/strict";
import test from "node:test";
import { buildUsagePeriods, countUsageByPeriod, japanCalendarDate } from "./subscription-usage.ts";

test("日本時間の日付で利用期間を集計する", () => {
  const now = new Date("2026-08-10T12:00:00.000Z");
  const usedDates = [
    new Date("2026-08-10T00:00:00.000Z"),
    new Date("2026-08-09T00:00:00.000Z"),
    new Date("2026-08-01T00:00:00.000Z"),
    new Date("2026-07-12T00:00:00.000Z"),
    new Date("2026-05-13T00:00:00.000Z"),
    new Date("2025-08-11T00:00:00.000Z"),
  ];

  assert.deepEqual(countUsageByPeriod(usedDates, now), {
    today: 1,
    week: 2,
    month: 3,
    days30: 4,
    days90: 5,
    days365: 6,
  });
});

test("日本時間の深夜をまたいでも同じ暦日を返す", () => {
  const beforeMidnightUtc = new Date("2026-08-10T14:59:59.000Z");
  const afterMidnightUtc = new Date("2026-08-10T15:00:00.000Z");

  assert.equal(japanCalendarDate(beforeMidnightUtc).toISOString(), "2026-08-10T00:00:00.000Z");
  assert.equal(japanCalendarDate(afterMidnightUtc).toISOString(), "2026-08-11T00:00:00.000Z");
  assert.equal(buildUsagePeriods(beforeMidnightUtc)[0].label, "今日");
});
