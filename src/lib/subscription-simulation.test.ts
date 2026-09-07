import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateSimulationTotals,
  virtualSubscriptionSchema,
} from "./subscription-simulation.ts";

test("外す契約と仮想追加を合わせて差額を計算する", () => {
  const result = calculateSimulationTotals(
    [
      { id: "keep", monthlyCost: 1_000 },
      { id: "remove", monthlyCost: 2_000 },
    ],
    new Set(["keep"]),
    [{ id: "virtual", monthlyCost: 500 }],
  );

  assert.deepEqual(result, {
    currentMonthlyTotal: 3_000,
    simulatedMonthlyTotal: 1_500,
    monthlyDifference: 1_500,
  });
});

test("仮想追加で支出が増える場合は負の差額を返す", () => {
  const result = calculateSimulationTotals(
    [{ id: "keep", monthlyCost: 1_000 }],
    new Set(["keep"]),
    [{ id: "virtual", monthlyCost: 1_500 }],
  );

  assert.equal(result.monthlyDifference, -1_500);
});

test("仮想サービス入力の空欄・負数・上限超過を拒否する", () => {
  assert.equal(
    virtualSubscriptionSchema.safeParse({
      name: "",
      monthlyCost: -1,
      categoryName: "",
    }).success,
    false,
  );
  assert.equal(
    virtualSubscriptionSchema.safeParse({
      name: "候補サービス",
      monthlyCost: 480,
      categoryName: "仕事",
    }).success,
    true,
  );
});
