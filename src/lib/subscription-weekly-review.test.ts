import assert from "node:assert/strict";
import test from "node:test";
import { needsWeeklyReview, startOfJapanWeek } from "./subscription-weekly-review.ts";

const now = new Date("2026-08-12T12:00:00.000Z");

test("直近7日の利用記録があれば定期確認は不要", () => {
  assert.equal(needsWeeklyReview({ lastReviewedAt: null, usedDates: [new Date("2026-08-10T00:00:00.000Z")] }, now), false);
});

test("直近7日の見直しがあれば定期確認は不要", () => {
  assert.equal(needsWeeklyReview({ lastReviewedAt: new Date("2026-08-09T00:00:00.000Z"), usedDates: [] }, now), false);
});

test("利用記録も見直しもなければ定期確認が必要", () => {
  assert.equal(needsWeeklyReview({ lastReviewedAt: new Date("2026-08-03T00:00:00.000Z"), usedDates: [] }, now), true);
});

test("週の開始日は日本時間の月曜日になる", () => {
  assert.equal(startOfJapanWeek(now).toISOString(), "2026-08-10T00:00:00.000Z");
});
