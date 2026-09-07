import assert from "node:assert/strict";
import test from "node:test";
import {
  notificationJobHealth,
  parseNotificationJobStatus,
  serializeNotificationJobStatus,
  type NotificationJobStatus,
} from "./notification-job-status.ts";

const succeeded: NotificationJobStatus = {
  state: "SUCCEEDED",
  startedAt: "2026-08-29T00:00:00.000Z",
  completedAt: "2026-08-29T00:01:00.000Z",
  sent: 2,
  skipped: 3,
  failures: 0,
};

test("ジョブ状態を検証して保存・復元する", () => {
  assert.deepEqual(
    parseNotificationJobStatus(serializeNotificationJobStatus(succeeded)),
    succeeded,
  );
  assert.equal(parseNotificationJobStatus("not-json"), null);
  assert.equal(parseNotificationJobStatus('{"state":"FAILED"}'), null);
});

test("正常・一部失敗・実行中を判定する", () => {
  const now = new Date("2026-08-29T01:00:00.000Z");
  assert.equal(notificationJobHealth(succeeded, now), "HEALTHY");
  assert.equal(
    notificationJobHealth({ ...succeeded, state: "PARTIAL", failures: 1 }, now),
    "DEGRADED",
  );
  assert.equal(
    notificationJobHealth({ ...succeeded, state: "RUNNING", completedAt: null }, now),
    "RUNNING",
  );
});

test("実行履歴なしと3時間を超えた状態を異常として区別する", () => {
  assert.equal(notificationJobHealth(null), "UNKNOWN");
  assert.equal(
    notificationJobHealth(succeeded, new Date("2026-08-29T04:01:01.000Z")),
    "STALE",
  );
});
