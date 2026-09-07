import assert from "node:assert/strict";
import test from "node:test";
import { buildSubscriptionCalendar, ICALENDAR_MAX_LINE_OCTETS } from "./calendar-export.ts";

const generatedAt = new Date("2026-08-30T03:00:00.000Z");

function subscription(overrides: Partial<Parameters<typeof buildSubscriptionCalendar>[0][number]> = {}) {
  return {
    id: "sub-1",
    name: "Cloud, Pro; Plan",
    price: 1_200,
    billingCycle: "MONTHLY",
    customCycleDays: null,
    nextBillingDate: new Date("2026-08-31T00:00:00.000Z"),
    trialEndsAt: null,
    cancellationDeadline: null,
    ...overrides,
  };
}

test("今後12か月の更新予定を終日イベントとして出力する", () => {
  const calendar = buildSubscriptionCalendar([subscription()], generatedAt);
  assert.match(calendar, /DTSTART;VALUE=DATE:20260831\r\n/);
  assert.match(calendar, /DTEND;VALUE=DATE:20260901\r\n/);
  assert.match(calendar, /SUMMARY:更新予定: Cloud\\, Pro\\; Plan\r\n/);
  assert.match(calendar, /DESCRIPTION:請求予定額: ￥1\\,200\\nSubscList/);
  assert.equal((calendar.match(/BEGIN:VEVENT/g) ?? []).length, 12);
});

test("無料期間終了と解約期限を別イベントとして出力する", () => {
  const calendar = buildSubscriptionCalendar([subscription({
    billingCycle: "YEARLY",
    trialEndsAt: new Date("2026-09-05T00:00:00.000Z"),
    cancellationDeadline: new Date("2026-09-03T00:00:00.000Z"),
  })], generatedAt);
  assert.match(calendar, /SUMMARY:無料期間終了:/);
  assert.match(calendar, /SUMMARY:解約期限:/);
  assert.match(calendar, /CATEGORIES:無料期間/);
  assert.match(calendar, /CATEGORIES:解約期限/);
});

test("過去日と12か月後の範囲外期限を除外する", () => {
  const calendar = buildSubscriptionCalendar([subscription({
    billingCycle: "YEARLY",
    trialEndsAt: new Date("2026-08-29T00:00:00.000Z"),
    cancellationDeadline: new Date("2027-08-30T00:00:00.000Z"),
  })], generatedAt);
  assert.doesNotMatch(calendar, /SUMMARY:無料期間終了:/);
  assert.doesNotMatch(calendar, /SUMMARY:解約期限:/);
});

test("日本語を含むすべての物理行を75オクテット以内に折り返す", () => {
  const calendar = buildSubscriptionCalendar([subscription({ name: "非常に長い日本語のサブスクリプションサービス名".repeat(5) })], generatedAt);
  const encoder = new TextEncoder();
  for (const line of calendar.split("\r\n").filter(Boolean)) {
    assert.ok(encoder.encode(line).length <= ICALENDAR_MAX_LINE_OCTETS, `${encoder.encode(line).length}: ${line}`);
  }
  assert.match(calendar, /\r\n /);
});
