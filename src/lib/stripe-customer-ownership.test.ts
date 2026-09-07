import assert from "node:assert/strict";
import test from "node:test";
import {
  isStripeRecoveryCandidate,
  storedStripeCustomerCanBelongToUser,
} from "./stripe-customer-ownership.ts";

test("DBに保存済みの顧客は所有者未設定の旧データまたは本人だけを許可する", () => {
  assert.equal(storedStripeCustomerCanBelongToUser(null, "user-1"), true);
  assert.equal(storedStripeCustomerCanBelongToUser("user-1", "user-1"), true);
  assert.equal(storedStripeCustomerCanBelongToUser("user-2", "user-1"), false);
});

test("メール検索からの復旧は本人を示すメタデータが必須", () => {
  assert.equal(isStripeRecoveryCandidate({}, "user-1"), false);
  assert.equal(
    isStripeRecoveryCandidate({ customerUserId: "user-1" }, "user-1"),
    true,
  );
  assert.equal(
    isStripeRecoveryCandidate(
      { customerUserId: "user-1", subscriptionUserId: "user-2" },
      "user-1",
    ),
    false,
  );
});
