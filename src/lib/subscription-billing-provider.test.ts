import assert from "node:assert/strict";
import test from "node:test";
import {
  billingProviderGuide,
  billingProviderLabel,
  parseBillingProvider,
} from "./subscription-billing-provider.ts";

test("未指定の請求元は既存互換の直接契約として扱う", () => {
  assert.equal(parseBillingProvider(""), "DIRECT");
  assert.equal(parseBillingProvider("直接契約"), "DIRECT");
  assert.equal(billingProviderLabel("DIRECT"), "サービスへ直接契約");
});

test("主要な第三者請求元を日本語と英語から判定する", () => {
  assert.equal(parseBillingProvider("App Store"), "APPLE_APP_STORE");
  assert.equal(parseBillingProvider("Google Play"), "GOOGLE_PLAY");
  assert.equal(parseBillingProvider("PayPal自動支払い"), "PAYPAL");
  assert.equal(parseBillingProvider("キャリア決済"), "MOBILE_CARRIER");
});

test("不明なCSV値を推測せず拒否する", () => {
  assert.equal(parseBillingProvider("unknown marketplace"), null);
});

test("第三者請求元には契約管理先と確認手順がある", () => {
  const guide = billingProviderGuide("GOOGLE_PLAY");
  assert.match(guide.managementUrl ?? "", /^https:\/\/play\.google\.com\//);
  assert.equal(guide.steps.length, 3);
});

test("DBの想定外値はその他として安全に表示する", () => {
  assert.equal(billingProviderGuide("LEGACY").value, "OTHER");
});
