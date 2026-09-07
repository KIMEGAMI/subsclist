import assert from "node:assert/strict";
import test from "node:test";
import {
  isRenewalDecisionDue,
  renewalDecisionPeriod,
  renewalDecisionStatus,
  renewalDecisionStatusLabel,
} from "./renewal-decision.ts";

test("日本時間の月境界から判断対象月を求める", () => {
  assert.deepEqual(
    renewalDecisionPeriod(new Date("2026-08-31T15:30:00.000Z")),
    { year: 2026, month: 9 },
  );
});

test("当日から30日以内の更新だけを判断対象にする", () => {
  const now = new Date("2026-08-28T03:00:00.000Z");
  assert.equal(isRenewalDecisionDue(new Date("2026-08-28T00:00:00.000Z"), now), true);
  assert.equal(isRenewalDecisionDue(new Date("2026-09-27T00:00:00.000Z"), now), true);
  assert.equal(isRenewalDecisionDue(new Date("2026-09-28T00:00:00.000Z"), now), false);
  assert.equal(isRenewalDecisionDue(new Date("2026-08-27T00:00:00.000Z"), now), false);
});

test("更新判断の状態を日本語で表示する", () => {
  assert.equal(renewalDecisionStatus("CONTINUE"), "CONTINUE");
  assert.equal(renewalDecisionStatus("PROPOSED"), undefined);
  assert.equal(renewalDecisionStatusLabel("CONTINUE"), "継続する");
  assert.equal(renewalDecisionStatusLabel("CANCEL_PLANNED"), "解約を検討");
  assert.equal(renewalDecisionStatusLabel("HOLD"), "再検討する");
});
