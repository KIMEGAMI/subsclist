import assert from "node:assert/strict";
import test from "node:test";
import { rankNews } from "./news-ranking.ts";

test("契約中の値上げニュースを最優先する", () => {
  const now = new Date("2026-09-20T00:00:00.000Z");
  const score = rankNews({ category: "PRICE_CHANGE", importance: 10, contracted: true, publishedAt: new Date("2026-09-19T12:00:00.000Z"), now });
  assert.equal(score, 200);
});

test("古い契約サービスの一般ニュースは新しい記事より低くなる", () => {
  const now = new Date("2026-09-20T00:00:00.000Z");
  const oldGeneral = rankNews({ category: "GENERAL", importance: 0, contracted: true, publishedAt: new Date("2026-09-01T00:00:00.000Z"), now });
  const freshContracted = rankNews({ category: "GENERAL", importance: 0, contracted: true, publishedAt: new Date("2026-09-19T12:00:00.000Z"), now });
  assert.ok(freshContracted > oldGeneral);
});
