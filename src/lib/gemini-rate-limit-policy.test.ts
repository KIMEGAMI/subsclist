import assert from "node:assert/strict";
import test from "node:test";
import { evaluateGeminiRateLimit } from "./gemini-rate-limit-policy.ts";

const now = new Date("2026-08-20T12:00:00.000Z");

test("1時間の上限未満なら実行を許可する", () => {
  const decision = evaluateGeminiRateLimit([
    new Date("2026-08-20T11:10:00.000Z"),
    new Date("2026-08-20T11:30:00.000Z"),
  ], now);
  assert.deepEqual(decision, { allowed: true });
});

test("1時間に3回実行済みなら最古の実行から1時間後まで拒否する", () => {
  const decision = evaluateGeminiRateLimit([
    new Date("2026-08-20T11:10:00.000Z"),
    new Date("2026-08-20T11:20:00.000Z"),
    new Date("2026-08-20T11:30:00.000Z"),
  ], now);
  assert.equal(decision.allowed, false);
  if (!decision.allowed) {
    assert.equal(decision.retryAt.toISOString(), "2026-08-20T12:10:00.000Z");
  }
});

test("24時間に10回実行済みなら日次上限として拒否する", () => {
  const requests = Array.from(
    { length: 10 },
    (_, index) => new Date(now.getTime() - (index + 2) * 60 * 60 * 1_000),
  );
  const decision = evaluateGeminiRateLimit(requests, now);
  assert.equal(decision.allowed, false);
});
