import assert from "node:assert/strict";
import test from "node:test";
import { buildTodayActions, summarizeToday, type TodayPriceChange, type TodaySubscription } from "./today.ts";

const base = (overrides: Partial<TodaySubscription> = {}): TodaySubscription => ({
  id: "sub-1",
  name: "Design Tool",
  price: 1200,
  billingCycle: "MONTHLY",
  customCycleDays: null,
  nextBillingDate: new Date("2026-09-20T00:00:00.000Z"),
  trialEndsAt: null,
  cancellationDeadline: null,
  usageDates: [],
  ...overrides,
});

test("Today actions prioritize cancellation deadlines and return at most three items", () => {
  const now = new Date("2026-09-12T02:00:00.000Z");
  const actions = buildTodayActions([
    base({ id: "a", name: "Low use", price: 500 }),
    base({ id: "b", name: "Trial", trialEndsAt: new Date("2026-09-14T00:00:00.000Z") }),
    base({ id: "c", name: "Cancel", cancellationDeadline: new Date("2026-09-12T00:00:00.000Z") }),
    base({ id: "d", name: "Renew", nextBillingDate: new Date("2026-09-15T00:00:00.000Z") }),
  ], now);

  assert.equal(actions.length, 3);
  assert.equal(actions[0]?.type, "CANCELLATION_DEADLINE");
  assert.deepEqual(actions.map((action) => action.subscriptionId), ["c", "b", "d"]);
});

test("Today summary uses Japan calendar dates and recurring monthly occurrences", () => {
  const summary = summarizeToday([
    base({ id: "today", price: 980, nextBillingDate: new Date("2026-09-12T00:00:00.000Z") }),
    base({ id: "week", price: 1500, nextBillingDate: new Date("2026-09-18T00:00:00.000Z") }),
  ], 700, new Date("2026-09-12T13:00:00.000Z"));

  assert.equal(summary.dueTodayCount, 1);
  assert.equal(summary.dueTodayAmount, 980);
  assert.equal(summary.renewalWithinWeekCount, 2);
  assert.equal(summary.monthPaidAmount, 700);
  assert.equal(summary.monthPlannedAmount, 2480);
});

test("Past deadlines do not create Today actions", () => {
  const actions = buildTodayActions([
    base({ cancellationDeadline: new Date("2026-09-01T00:00:00.000Z") }),
  ], new Date("2026-09-12T00:00:00.000Z"));

  assert.equal(actions.some((action) => action.type === "CANCELLATION_DEADLINE"), false);
});

test("Price changes become review actions linked to contract news", () => {
  const priceChange: TodayPriceChange = {
    id: "change-1",
    serviceId: "service-1",
    serviceName: "Design Tool",
    planName: "Pro",
    oldAmount: 1_000,
    newAmount: 1_500,
    changeAmount: 500,
    currency: "JPY",
  };

  const actions = buildTodayActions([], new Date("2026-09-12T00:00:00.000Z"), [priceChange]);

  assert.equal(actions[0]?.type, "PRICE_CHANGE_REVIEW");
  assert.equal(actions[0]?.href, "/subscription-news");
  assert.match(actions[0]?.detail ?? "", /1,000から1,500JPY/);
});
