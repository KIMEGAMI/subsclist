import assert from "node:assert/strict";
import test from "node:test";
import { japanHour, shouldRunNotificationAtHour } from "./notification-schedule.ts";

const nineAmJapan = new Date("2026-08-12T00:00:00.000Z");

test("日本時間の時刻を返す", () => {
  assert.equal(japanHour(nineAmJapan), 9);
});

test("設定した日本時間の時刻だけ自動通知を実行する", () => {
  assert.equal(shouldRunNotificationAtHour(9, nineAmJapan), true);
  assert.equal(shouldRunNotificationAtHour(10, nineAmJapan), false);
});

test("通知時刻が未設定なら既定の9時を使う", () => {
  assert.equal(shouldRunNotificationAtHour(null, nineAmJapan), true);
});
