import assert from "node:assert/strict";
import test from "node:test";
import { detectCategoryDuplicates } from "./subscription-duplicates.ts";

test("同一カテゴリだけを重複候補として月額合計順に返す", () => {
  const result = detectCategoryDuplicates([
    { id: "video-a", name: "動画A", categoryName: "動画", monthlyCost: 1000, usageDays30: 8 },
    { id: "video-b", name: "動画B", categoryName: "動画", monthlyCost: 2000, usageDays30: 0 },
    { id: "music", name: "音楽", categoryName: "音楽", monthlyCost: 980, usageDays30: 12 },
    { id: "none", name: "未分類", categoryName: null, monthlyCost: 500, usageDays30: 0 },
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.categoryName, "動画");
  assert.equal(result[0]?.monthlyCost, 3000);
  assert.equal(result[0]?.subscriptions[0]?.id, "video-b");
});
