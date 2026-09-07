import assert from "node:assert/strict";
import test from "node:test";
import {
  BULK_SUBSCRIPTION_UPDATE_MAX_ITEMS,
  bulkSubscriptionUpdateData,
  bulkSubscriptionUpdateSchema,
  selectedIdsAreVisible,
} from "./subscription-bulk-update.ts";

test("一括更新は1件以上かつ上限以内の重複しないIDだけを受け付ける", () => {
  assert.equal(bulkSubscriptionUpdateSchema.safeParse({ subscriptionIds: [], priority: "USEFUL" }).success, false);
  assert.equal(bulkSubscriptionUpdateSchema.safeParse({ subscriptionIds: ["sub-1", "sub-1"], priority: "USEFUL" }).success, false);
  assert.equal(bulkSubscriptionUpdateSchema.safeParse({
    subscriptionIds: Array.from({ length: BULK_SUBSCRIPTION_UPDATE_MAX_ITEMS + 1 }, (_, index) => `sub-${index}`),
    priority: "USEFUL",
  }).success, false);
});

test("更新項目がない入力を拒否する", () => {
  assert.equal(bulkSubscriptionUpdateSchema.safeParse({ subscriptionIds: ["sub-1"] }).success, false);
});

test("許可された一括更新項目を検証する", () => {
  const result = bulkSubscriptionUpdateSchema.safeParse({
    subscriptionIds: ["sub-1", "sub-2"],
    categoryId: null,
    paymentMethodId: "payment-1",
    usageFrequency: "WEEKLY",
    priority: "ESSENTIAL",
    businessUsePercent: 75,
    markReviewed: true,
  });
  assert.equal(result.success, true);
});

test("仕事利用割合の範囲外と文字列を拒否する", () => {
  for (const value of [-1, 101, "50"]) {
    assert.equal(bulkSubscriptionUpdateSchema.safeParse({
      subscriptionIds: ["sub-1"],
      businessUsePercent: value,
    }).success, false);
  }
});

test("未指定項目は更新データへundefinedとして渡す", () => {
  const parsed = bulkSubscriptionUpdateSchema.parse({
    subscriptionIds: ["sub-1"],
    categoryId: null,
  });
  const data = bulkSubscriptionUpdateData(parsed);
  assert.equal(data.categoryId, null);
  assert.equal(data.paymentMethodId, undefined);
  assert.equal(data.lastReviewedAt, undefined);
});

test("見直し済み指定では現在日時を更新データへ含める", () => {
  const before = Date.now();
  const parsed = bulkSubscriptionUpdateSchema.parse({ subscriptionIds: ["sub-1"], markReviewed: true });
  const data = bulkSubscriptionUpdateData(parsed);
  assert.equal(data.lastReviewedAt instanceof Date, true);
  assert.equal((data.lastReviewedAt?.getTime() ?? 0) >= before, true);
});

test("表示範囲外のIDが一つでもあれば拒否する", () => {
  assert.equal(selectedIdsAreVisible(["sub-1", "sub-2"], ["sub-1", "sub-2", "sub-3"]), true);
  assert.equal(selectedIdsAreVisible(["sub-1", "hidden"], ["sub-1", "sub-2"]), false);
});
