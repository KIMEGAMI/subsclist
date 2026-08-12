import assert from "node:assert/strict";
import test from "node:test";
import { priceIncreaseRegisteredToday, unusedNotificationMilestone } from "./engagement-notifications.ts";

test("未使用通知は現在到達している最長段階だけを返す", () => {
  const result = unusedNotificationMilestone(
    { createdAt: new Date("2026-04-01T00:00:00.000Z"), lastUsedAt: new Date("2026-05-01T00:00:00.000Z") },
    new Date("2026-07-05T00:00:00.000Z"),
  );

  assert.equal(result?.days, 60);
  assert.equal(result?.targetDate.toISOString(), "2026-06-30T00:00:00.000Z");
});

test("登録から30日未満の契約は未使用通知の対象にしない", () => {
  const result = unusedNotificationMilestone(
    { createdAt: new Date("2026-08-01T00:00:00.000Z") },
    new Date("2026-08-20T00:00:00.000Z"),
  );

  assert.equal(result, null);
});

test("当日に登録された月額換算の値上げだけを検出する", () => {
  const result = priceIncreaseRegisteredToday({
    currentPrice: 1_200,
    currentBillingCycle: "MONTHLY",
    previousPrice: 12_000,
    previousBillingCycle: "YEARLY",
    effectiveFrom: new Date("2026-08-12T04:00:00.000Z"),
  }, new Date("2026-08-12T08:00:00.000Z"));

  assert.equal(result?.previousMonthly, 1_000);
  assert.equal(result?.increase, 200);
});
