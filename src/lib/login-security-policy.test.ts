import assert from "node:assert/strict";
import test from "node:test";
import {
  isAccountLoginLocked,
  loginClientLabel,
  nextLoginFailure,
} from "./login-security-policy.ts";

test("15分以内の5回目の失敗でアカウントをロックする", () => {
  const now = new Date("2026-08-18T00:10:00.000Z");
  const result = nextLoginFailure(
    {
      failedLoginCount: 4,
      lastFailedLoginAt: new Date("2026-08-18T00:09:00.000Z"),
    },
    now,
  );

  assert.equal(result.failedLoginCount, 5);
  assert.equal(result.lockedUntil?.toISOString(), "2026-08-18T00:25:00.000Z");
  assert.equal(isAccountLoginLocked(result.lockedUntil, now), true);
  assert.equal(isAccountLoginLocked(result.lockedUntil, result.lockedUntil!), false);
});

test("失敗から15分以上経過していれば回数をリセットする", () => {
  const result = nextLoginFailure(
    {
      failedLoginCount: 4,
      lastFailedLoginAt: new Date("2026-08-18T00:00:00.000Z"),
    },
    new Date("2026-08-18T00:15:00.000Z"),
  );

  assert.equal(result.failedLoginCount, 1);
  assert.equal(result.lockedUntil, null);
});

test("利用者向け端末表示ではUser-Agentの詳細値を保持しない", () => {
  assert.equal(
    loginClientLabel(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
    ),
    "Google Chrome / Windows",
  );
  assert.equal(loginClientLabel(null), "不明なブラウザ / 不明なOS");
});
