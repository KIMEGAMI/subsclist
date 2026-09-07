import assert from "node:assert/strict";
import test from "node:test";
import {
  convertedPriceInJpy,
  formatExchangeRateScaled,
  formatSourceAmountMinor,
  isForeignSubscriptionCurrency,
  parseExchangeRateScaled,
  parseSourceAmountMinor,
  subscriptionCurrencyContext,
} from "./subscription-currency.ts";

test("通貨ごとの小数桁で原通貨額を最小単位へ変換する", () => {
  assert.equal(parseSourceAmountMinor("20.00", "USD"), 2_000);
  assert.equal(parseSourceAmountMinor("20.5", "USD"), 2_050);
  assert.equal(parseSourceAmountMinor("1490", "JPY"), 1_490);
  assert.equal(parseSourceAmountMinor("20000", "KRW"), 20_000);
  assert.equal(formatSourceAmountMinor(2_050, "USD"), "20.50");
  assert.equal(formatSourceAmountMinor(20_000, "KRW"), "20000");
});

test("過剰な小数桁・負数・指数表記・上限超過を拒否する", () => {
  assert.equal(parseSourceAmountMinor("20.001", "USD"), null);
  assert.equal(parseSourceAmountMinor("-20", "USD"), null);
  assert.equal(parseSourceAmountMinor("2e1", "USD"), null);
  assert.equal(parseSourceAmountMinor("100000001", "USD"), null);
  assert.equal(parseSourceAmountMinor("1.00", "JPY"), null);
});

test("円換算レートを1万分の1単位で往復する", () => {
  assert.equal(parseExchangeRateScaled("147.1234"), 1_471_234);
  assert.equal(parseExchangeRateScaled("147.1"), 1_471_000);
  assert.equal(formatExchangeRateScaled(1_471_234), "147.1234");
  assert.equal(formatExchangeRateScaled(1_471_000), "147.1");
  assert.equal(parseExchangeRateScaled("0"), null);
  assert.equal(parseExchangeRateScaled("147.12345"), null);
});

test("整数演算で原通貨額を円へ四捨五入換算する", () => {
  assert.equal(convertedPriceInJpy(2_000, "USD", 1_471_234), 2_942);
  assert.equal(convertedPriceInJpy(999, "USD", 1_500_000), 1_499);
  assert.equal(convertedPriceInJpy(20_000, "KRW", 1_100), 2_200);
});

test("JPYと外貨を区別する", () => {
  assert.equal(isForeignSubscriptionCurrency("JPY"), false);
  assert.equal(isForeignSubscriptionCurrency("USD"), true);
});

test("JPYでは外貨情報を消去し、外貨では請求額とレートを必須にする", () => {
  assert.deepEqual(
    subscriptionCurrencyContext({
      currency: "JPY",
      sourceAmount: "20.00",
      exchangeRateToJpy: "147.1",
    }),
    {
      ok: true,
      data: {
        currency: "JPY",
        sourceAmountMinor: null,
        exchangeRateToJpyScaled: null,
      },
    },
  );
  assert.equal(
    subscriptionCurrencyContext({
      currency: "USD",
      sourceAmount: "",
      exchangeRateToJpy: "147.1",
    }).ok,
    false,
  );
  assert.deepEqual(
    subscriptionCurrencyContext({
      currency: "USD",
      sourceAmount: "20.00",
      exchangeRateToJpy: "147.1",
    }),
    {
      ok: true,
      data: {
        currency: "USD",
        sourceAmountMinor: 2_000,
        exchangeRateToJpyScaled: 1_471_000,
      },
    },
  );
});
