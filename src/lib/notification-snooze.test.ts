import assert from "node:assert/strict";
import test from "node:test";
import {
  isSubscriptionNotificationSnoozed,
  notificationSnoozeInputSchema,
  notificationSnoozeUntil,
} from "./notification-snooze.ts";

const now = new Date("2026-08-30T03:00:00.000Z");

test("1日・7日・30日の通知一時停止期限を現在時刻から算出する", () => {
  assert.equal(notificationSnoozeUntil("ONE_DAY", now)?.toISOString(), "2026-08-31T03:00:00.000Z");
  assert.equal(notificationSnoozeUntil("SEVEN_DAYS", now)?.toISOString(), "2026-09-06T03:00:00.000Z");
  assert.equal(notificationSnoozeUntil("THIRTY_DAYS", now)?.toISOString(), "2026-09-29T03:00:00.000Z");
});

test("再開操作は一時停止期限を解除する", () => {
  assert.equal(notificationSnoozeUntil("CLEAR", now), null);
});

test("期限より前だけ一時停止中として扱う", () => {
  const until = new Date("2026-09-06T03:00:00.000Z");
  assert.equal(isSubscriptionNotificationSnoozed(until, new Date("2026-09-06T02:59:59.999Z")), true);
  assert.equal(isSubscriptionNotificationSnoozed(until, new Date("2026-09-06T03:00:00.000Z")), false);
  assert.equal(isSubscriptionNotificationSnoozed(null, now), false);
});

test("定義済みの期間と再開だけを入力として許可する", () => {
  assert.equal(notificationSnoozeInputSchema.safeParse({ duration: "SEVEN_DAYS" }).success, true);
  assert.equal(notificationSnoozeInputSchema.safeParse({ duration: "FOREVER" }).success, false);
  assert.equal(notificationSnoozeInputSchema.safeParse({ duration: 7 }).success, false);
});
