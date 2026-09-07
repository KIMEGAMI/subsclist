import assert from "node:assert/strict";
import test from "node:test";
import { stripeCancellationScheduled, stripeSubscriptionPeriodData } from "./stripe-subscription-period.ts";

const FIRST_PERIOD_END = Date.parse("2026-08-31T00:00:00.000Z") / 1000;
const SECOND_PERIOD_END = Date.parse("2026-09-30T00:00:00.000Z") / 1000;

test("最も早い契約項目の期間終了を次回更新日として返す", () => {
  const result = stripeSubscriptionPeriodData({
    cancel_at: null,
    cancel_at_period_end: false,
    items: {
      data: [
        { current_period_end: SECOND_PERIOD_END },
        { current_period_end: FIRST_PERIOD_END },
      ],
    },
  });

  assert.equal(result.stripeCurrentPeriodEnd?.toISOString(), "2026-08-31T00:00:00.000Z");
  assert.equal(result.stripeCancelAt, null);
  assert.equal(result.stripeCancelAtPeriodEnd, false);
});

test("期間終了時解約は期間終了日を利用終了予定日にする", () => {
  const result = stripeSubscriptionPeriodData({
    cancel_at: null,
    cancel_at_period_end: true,
    items: { data: [{ current_period_end: FIRST_PERIOD_END }] },
  });

  assert.equal(result.stripeCancelAt?.toISOString(), "2026-08-31T00:00:00.000Z");
  assert.equal(result.stripeCancelAtPeriodEnd, true);
});

test("明示された解約日時を期間終了日より優先する", () => {
  const result = stripeSubscriptionPeriodData({
    cancel_at: SECOND_PERIOD_END,
    cancel_at_period_end: false,
    items: { data: [{ current_period_end: FIRST_PERIOD_END }] },
  });

  assert.equal(result.stripeCancelAt?.toISOString(), "2026-09-30T00:00:00.000Z");
});

test("将来の解約予定だけを有効と判定する", () => {
  const now = new Date("2026-08-31T00:00:00.000Z");
  assert.equal(stripeCancellationScheduled("2026-09-30T00:00:00.000Z", now), true);
  assert.equal(stripeCancellationScheduled("2026-08-31T00:00:00.000Z", now), false);
  assert.equal(stripeCancellationScheduled(null, now), false);
});
