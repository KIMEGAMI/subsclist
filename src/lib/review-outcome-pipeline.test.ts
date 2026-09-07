import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewOutcomePipeline } from "./review-outcome-pipeline.ts";

const referenceDate = new Date("2026-08-30T03:00:00.000Z");

function subscription(overrides: Partial<Parameters<typeof buildReviewOutcomePipeline>[0][number]> = {}) {
  return {
    id: "sub-1",
    name: "動画サービス",
    monthlyCost: 1_000,
    candidateMonthlySaving: 700,
    isCandidate: true,
    cancellationStatus: "NONE" as const,
    plannedCancelAt: null,
    updatedAt: new Date("2026-08-29T03:00:00.000Z"),
    ...overrides,
  };
}

test("候補から判断、手続き、実績までを重複せず分類する", () => {
  const result = buildReviewOutcomePipeline(
    [
      subscription(),
      subscription({ id: "sub-2", name: "継続サービス", isCandidate: false }),
      subscription({ id: "sub-3", name: "手続きサービス", cancellationStatus: "PLANNED" }),
      subscription({ id: "sub-4", name: "完了サービス", cancellationStatus: "COMPLETED" }),
    ],
    [{ subscriptionId: "sub-2", status: "CANCEL_PLANNED", potentialMonthlySaving: 800, decidedAt: new Date("2026-08-29T03:00:00.000Z") }],
    [{ id: "sub-4", name: "完了サービス", monthlyCost: 2_000, cancellationCompletedAt: new Date("2026-08-20T03:00:00.000Z") }],
    referenceDate,
  );

  assert.deepEqual(
    result.stages.map((stage) => [stage.stage, stage.count, stage.monthlyAmount]),
    [
      ["CANDIDATE", 1, 700],
      ["DECIDED", 1, 800],
      ["IN_PROGRESS", 1, 1_000],
      ["REALIZED", 1, 2_000],
    ],
  );
  assert.equal(result.items.filter((item) => item.id === "sub-4").length, 1);
  assert.equal(result.realizedMonthlyRunRate, 2_000);
});

test("同じ契約では手続き状態を判断履歴より優先する", () => {
  const result = buildReviewOutcomePipeline(
    [subscription({ cancellationStatus: "REQUESTED" })],
    [{ subscriptionId: "sub-1", status: "CANCEL_PLANNED", potentialMonthlySaving: 700, decidedAt: new Date("2026-08-28T03:00:00.000Z") }],
    [],
    referenceDate,
  );

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.stage, "IN_PROGRESS");
  assert.equal(result.items[0]?.nextAction, "受付記録を残して完了を確認する");
});

test("継続判断を削減見込みへ加算しない", () => {
  const result = buildReviewOutcomePipeline(
    [subscription()],
    [{ subscriptionId: "sub-1", status: "CONTINUE", potentialMonthlySaving: 1_000, decidedAt: new Date("2026-08-29T03:00:00.000Z") }],
    [],
    referenceDate,
  );

  assert.equal(result.stages.find((stage) => stage.stage === "DECIDED")?.monthlyAmount, 0);
  assert.equal(result.items[0]?.statusLabel, "継続");
});

test("期限超過と14日以上の停滞を要対応として数える", () => {
  const result = buildReviewOutcomePipeline(
    [
      subscription({ id: "sub-overdue", cancellationStatus: "PLANNED", plannedCancelAt: new Date("2026-08-29T03:00:00.000Z") }),
      subscription({ id: "sub-stale", cancellationStatus: "CONSIDERING", isCandidate: false, updatedAt: new Date("2026-08-16T03:00:00.000Z") }),
    ],
    [],
    [],
    referenceDate,
  );

  assert.equal(result.attentionCount, 2);
  assert.equal(result.items.find((item) => item.id === "sub-overdue")?.attentionReason, "解約予定日を過ぎています");
  assert.match(result.items.find((item) => item.id === "sub-stale")?.attentionReason ?? "", /14日以上/);
});

test("未来の解約完了は実績へ含めない", () => {
  const result = buildReviewOutcomePipeline(
    [],
    [],
    [{ id: "future", name: "未来", monthlyCost: 5_000, cancellationCompletedAt: new Date("2026-09-01T03:00:00.000Z") }],
    referenceDate,
  );

  assert.equal(result.stages.find((stage) => stage.stage === "REALIZED")?.count, 0);
});
