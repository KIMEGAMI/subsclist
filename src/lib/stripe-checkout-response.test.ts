import assert from "node:assert/strict";
import test from "node:test";
import { wantsStripeCheckoutRedirect } from "./stripe-checkout-response.ts";

test("画面のfetch要求にはStripe URLをJSONで返す", () => {
  assert.equal(
    wantsStripeCheckoutRedirect({
      accept: "application/json",
      contentType: null,
    }),
    false,
  );
});

test("JavaScript無効時の通常フォーム送信はStripeへリダイレクトする", () => {
  assert.equal(
    wantsStripeCheckoutRedirect({
      accept: "text/html,application/xhtml+xml",
      contentType: "application/x-www-form-urlencoded",
    }),
    true,
  );
});
