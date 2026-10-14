import assert from "node:assert/strict";
import test from "node:test";
import { buildNewsDigest } from "./news-digest.ts";

test("ニュースを10項目の要点に整理する", () => {
  const lines = buildNewsDigest({ title: "料金改定のお知らせ", summary: "対象プランの料金と提供条件が変更されます。", serviceName: "サービスA", category: "料金変更", publishedLabel: "2026年9月20日", sourceName: "日本語ニュース" });
  assert.equal(lines.length, 10);
  assert.equal(lines[1], "概要: 対象プランの料金と提供条件が変更されます。");
});
