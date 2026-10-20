import assert from "node:assert/strict";
import test from "node:test";
import { hasPremiumAccess, portfolioFreeModeEnabled } from "./portfolio-mode.ts";

test("ポートフォリオ無料モードは明示的なtrueのときだけ有効になる", () => {
  const configuredValue = process.env.SUBSCLIST_FREE_PORTFOLIO;
  try {
    delete process.env.SUBSCLIST_FREE_PORTFOLIO;
    assert.equal(portfolioFreeModeEnabled(), false);
    assert.equal(portfolioFreeModeEnabled("true"), true);
    assert.equal(portfolioFreeModeEnabled("false"), false);
  } finally {
    if (configuredValue === undefined) {
      delete process.env.SUBSCLIST_FREE_PORTFOLIO;
    } else {
      process.env.SUBSCLIST_FREE_PORTFOLIO = configuredValue;
    }
  }
});

test("無料公開モードはFreeを含むすべてのプランにPremium機能を許可する", () => {
  for (const plan of ["FREE", "PREMIUM", "LIFETIME", null, undefined]) {
    assert.equal(hasPremiumAccess(plan, true), true);
  }
});

test("無料公開モードを無効にした場合は従来のプラン判定を保つ", () => {
  assert.equal(hasPremiumAccess("FREE", false), false);
  assert.equal(hasPremiumAccess("PREMIUM", false), true);
  assert.equal(hasPremiumAccess("LIFETIME", false), true);
});
