import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCompletedSavingsTimeline,
  summarizeCompletedSavings,
} from "./subscription-savings.ts";

test("指定年に解約完了した契約だけを削減実績へ集計する", () => {
  const result = summarizeCompletedSavings(
    [
      {
        price: 1_000,
        billingCycle: "MONTHLY",
        cancellationCompletedAt: new Date("2026-02-01T00:00:00+09:00"),
      },
      {
        price: 12_000,
        billingCycle: "YEARLY",
        cancellationCompletedAt: new Date("2026-04-01T00:00:00+09:00"),
      },
      {
        price: 5_000,
        billingCycle: "MONTHLY",
        cancellationCompletedAt: new Date("2025-12-01T00:00:00+09:00"),
      },
    ],
    2026,
  );

  assert.equal(result.completedCount, 2);
  assert.equal(result.monthlySaving, 2_000);
  assert.equal(result.annualSaving, 24_000);
  assert.equal(result.achievements[1]?.reached, true);
  assert.equal(result.achievements[2]?.reached, false);
});

test("解約完了日時がない契約は削減実績へ含めない", () => {
  const result = summarizeCompletedSavings(
    [
      {
        price: 1_000,
        billingCycle: "MONTHLY",
        cancellationCompletedAt: null,
      },
    ],
    2026,
  );

  assert.equal(result.completedCount, 0);
  assert.equal(result.annualSaving, 0);
});

test("日本時間の年境界で解約完了年を判定する", () => {
  const result = summarizeCompletedSavings([
    {
      price: 1_000,
      billingCycle: "MONTHLY",
      cancellationCompletedAt: new Date("2025-12-31T15:30:00.000Z"),
    },
  ], 2026);
  assert.equal(result.completedCount, 1);
});

test("12か月の新規削減額と継続削減ランレートを積み上げる", () => {
  const timeline = buildCompletedSavingsTimeline([
    {
      price: 1_000,
      billingCycle: "MONTHLY",
      cancellationCompletedAt: new Date("2026-02-15T00:00:00.000Z"),
    },
    {
      price: 12_000,
      billingCycle: "YEARLY",
      cancellationCompletedAt: new Date("2026-04-01T00:00:00.000Z"),
    },
  ], new Date("2026-05-20T00:00:00.000Z"), 4);

  assert.deepEqual(timeline.points, [
    { year: 2026, month: 2, newMonthlySaving: 1_000, runRate: 1_000 },
    { year: 2026, month: 3, newMonthlySaving: 0, runRate: 1_000 },
    { year: 2026, month: 4, newMonthlySaving: 1_000, runRate: 2_000 },
    { year: 2026, month: 5, newMonthlySaving: 0, runRate: 2_000 },
  ]);
  assert.equal(timeline.currentAnnualRunRate, 24_000);
  assert.equal(timeline.maxRunRate, 2_000);
});

test("未来日と解約未完了は成果へ含めない", () => {
  const timeline = buildCompletedSavingsTimeline([
    { price: 1_000, billingCycle: "MONTHLY", cancellationCompletedAt: null },
    { price: 2_000, billingCycle: "MONTHLY", cancellationCompletedAt: new Date("2026-10-01T00:00:00.000Z") },
  ], new Date("2026-05-20T00:00:00.000Z"), 1);
  assert.equal(timeline.currentMonthlyRunRate, 0);
});
