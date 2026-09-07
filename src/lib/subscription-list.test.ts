import assert from "node:assert/strict";
import test from "node:test";
import {
  filterAndSortSubscriptions,
  normalizeSubscriptionListFilters,
  SUBSCRIPTION_LIST_QUERY_MAX_LENGTH,
  type SubscriptionListFilters,
  type SubscriptionListItem,
} from "./subscription-list.ts";

function item(overrides: Partial<SubscriptionListItem> = {}): SubscriptionListItem {
  return {
    id: "sub-1",
    name: "Netflix",
    memo: "家族で利用",
    status: "ACTIVE",
    categoryId: "video",
    categoryName: "動画",
    paymentMethodName: "Visa",
    cancellationRouteReady: true,
    setupComplete: true,
    reviewDue: false,
    nextBillingDate: new Date("2026-09-03T00:00:00.000Z"),
    monthlyCost: 1_490,
    ...overrides,
  };
}

const defaultFilters: SubscriptionListFilters = {
  query: "",
  status: "ALL",
  categoryId: "",
  dataState: "ALL",
  sort: "RENEWAL",
};

test("不正な検索条件を既定値へ戻し検索語の長さを制限する", () => {
  const result = normalizeSubscriptionListFilters({
    q: [" x ".repeat(SUBSCRIPTION_LIST_QUERY_MAX_LENGTH), "ignored"],
    status: "UNKNOWN",
    data: "BROKEN",
    sort: "INVALID",
  });
  assert.equal(result.query.length, SUBSCRIPTION_LIST_QUERY_MAX_LENGTH);
  assert.equal(result.status, "ALL");
  assert.equal(result.dataState, "ALL");
  assert.equal(result.sort, "RENEWAL");
});

test("サービス名・メモ・カテゴリ・支払い方法を表記揺れを吸収して検索する", () => {
  const items = [
    item(),
    item({ id: "sub-2", name: "Ａｄｏｂｅ", memo: null, categoryName: "仕事", paymentMethodName: "Mastercard" }),
  ];
  for (const query of ["adobe", "仕事", "mastercard"]) {
    const result = filterAndSortSubscriptions(items, { ...defaultFilters, query });
    assert.deepEqual(result.map((entry) => entry.id), ["sub-2"]);
  }
  assert.deepEqual(
    filterAndSortSubscriptions(items, { ...defaultFilters, query: "家族" }).map((entry) => entry.id),
    ["sub-1"],
  );
});

test("状態とカテゴリを同時に絞り込む", () => {
  const items = [
    item(),
    item({ id: "sub-2", status: "PAUSED", categoryId: "work" }),
    item({ id: "sub-3", status: "ACTIVE", categoryId: "work" }),
  ];
  const result = filterAndSortSubscriptions(items, {
    ...defaultFilters,
    status: "ACTIVE",
    categoryId: "work",
  });
  assert.deepEqual(result.map((entry) => entry.id), ["sub-3"]);
});

test("要整理と解約URL未設定を別々に抽出する", () => {
  const items = [
    item(),
    item({ id: "sub-2", setupComplete: false, cancellationRouteReady: true }),
    item({ id: "sub-3", setupComplete: false, cancellationRouteReady: false }),
  ];
  assert.deepEqual(
    filterAndSortSubscriptions(items, { ...defaultFilters, dataState: "NEEDS_SETUP" }).map((entry) => entry.id),
    ["sub-2", "sub-3"],
  );
  assert.deepEqual(
    filterAndSortSubscriptions(items, { ...defaultFilters, dataState: "MISSING_CANCELLATION" }).map((entry) => entry.id),
    ["sub-3"],
  );
});

test("見直し期限だけを抽出する", () => {
  const items = [item(), item({ id: "sub-2", reviewDue: true })];
  const result = filterAndSortSubscriptions(items, { ...defaultFilters, dataState: "REVIEW_DUE" });
  assert.deepEqual(result.map((entry) => entry.id), ["sub-2"]);
});

test("月額換算額の高い順と名前順で安定して並べる", () => {
  const items = [
    item({ id: "sub-1", name: "Zoom", monthlyCost: 2_000 }),
    item({ id: "sub-2", name: "Adobe", monthlyCost: 6_480 }),
    item({ id: "sub-3", name: "Canva", monthlyCost: 2_000 }),
  ];
  assert.deepEqual(
    filterAndSortSubscriptions(items, { ...defaultFilters, sort: "COST_DESC" }).map((entry) => entry.id),
    ["sub-2", "sub-3", "sub-1"],
  );
  assert.deepEqual(
    filterAndSortSubscriptions(items, { ...defaultFilters, sort: "NAME" }).map((entry) => entry.id),
    ["sub-2", "sub-3", "sub-1"],
  );
});
