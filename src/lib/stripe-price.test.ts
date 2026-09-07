import assert from "node:assert/strict";
import test from "node:test";
import { validatePremiumStripePrice } from "./stripe-price.ts";

const validPrice = {
  active: true,
  currency: "jpy",
  unit_amount: 480,
  recurring: {
    interval: "month",
    interval_count: 1,
    usage_type: "licensed",
  },
};

test("JPY 480円の月額固定Priceだけを許可する", () => {
  assert.equal(validatePremiumStripePrice(validPrice, 480), null);
});

test("金額・通貨・周期・従量課金の不一致を拒否する", () => {
  assert.equal(
    validatePremiumStripePrice({ ...validPrice, unit_amount: 980 }, 480),
    "wrong_amount",
  );
  assert.equal(
    validatePremiumStripePrice({ ...validPrice, currency: "usd" }, 480),
    "wrong_currency",
  );
  assert.equal(
    validatePremiumStripePrice(
      {
        ...validPrice,
        recurring: { ...validPrice.recurring, interval_count: 2 },
      },
      480,
    ),
    "not_monthly",
  );
  assert.equal(
    validatePremiumStripePrice(
      {
        ...validPrice,
        recurring: { ...validPrice.recurring, usage_type: "metered" },
      },
      480,
    ),
    "metered",
  );
});
