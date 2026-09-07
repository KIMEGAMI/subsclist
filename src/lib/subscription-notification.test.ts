import assert from "node:assert/strict";
import test from "node:test";
import {
  effectiveSubscriptionNotification,
  notificationEnabledSchema,
  optionalNotificationEnabledSchema,
} from "./subscription-notification.ts";

test("フォーム文字列とJSON booleanを通知設定へ変換する", () => {
  assert.equal(notificationEnabledSchema.parse(undefined), true);
  assert.equal(notificationEnabledSchema.parse("true"), true);
  assert.equal(notificationEnabledSchema.parse("false"), false);
  assert.equal(optionalNotificationEnabledSchema.parse(true), true);
  assert.equal(optionalNotificationEnabledSchema.parse(false), false);
});

test("不明なboolean入力は拒否する", () => {
  assert.equal(notificationEnabledSchema.safeParse("yes").success, false);
});

test("保存済み設定を最優先し既存契約は安全な既定値へ戻す", () => {
  assert.deepEqual(
    effectiveSubscriptionNotification({
      settings: [{ enabled: false, daysBefore: 3 }],
      subscriptionDaysBefore: 7,
      fallbackDaysBefore: 9,
    }),
    { enabled: false, daysBefore: 3 },
  );
  assert.deepEqual(
    effectiveSubscriptionNotification({
      settings: undefined,
      subscriptionDaysBefore: null,
      fallbackDaysBefore: 9,
    }),
    { enabled: true, daysBefore: 9 },
  );
});
