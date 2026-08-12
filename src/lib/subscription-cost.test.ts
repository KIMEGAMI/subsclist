import assert from "node:assert/strict";
import test from "node:test";
import { calculateCostPerUsage } from "./subscription-cost.ts";

test("月額料金を今月の利用日数で割る", () => {
  const result = calculateCostPerUsage(890, "MONTHLY", null, 8);

  assert.equal(result.monthlyCost, 890);
  assert.equal(result.usageDays, 8);
  assert.equal(result.costPerUsage, 111.25);
});

test("年払いは月額換算し、利用0日は算出不可にする", () => {
  const result = calculateCostPerUsage(12000, "YEARLY", null, 0);

  assert.equal(result.monthlyCost, 1000);
  assert.equal(result.costPerUsage, null);
});
