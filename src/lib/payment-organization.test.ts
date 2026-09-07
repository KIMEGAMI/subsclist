import assert from "node:assert/strict";
import test from "node:test";
import { paymentOrganizationMissing, summarizePaymentOrganization } from "./payment-organization.ts";

test("整理用科目と証憑の両方がある支払いだけを整理済みにする", () => {
  const summary = summarizePaymentOrganization([
    { accountingLabel: "通信費", referenceNumber: "INV-001", referenceUrl: null },
    { accountingLabel: "支払手数料", referenceNumber: null, referenceUrl: null },
    { accountingLabel: null, referenceNumber: null, referenceUrl: "https://example.test/receipt" },
    { accountingLabel: null, referenceNumber: null, referenceUrl: null },
  ]);

  assert.deepEqual(summary, {
    totalCount: 4,
    labeledCount: 2,
    evidencedCount: 2,
    organizedCount: 1,
    missingCount: 3,
    completionPercent: 25,
  });
});

test("証憑番号か証憑URLのいずれかがあれば証憑ありと判定する", () => {
  assert.deepEqual(
    paymentOrganizationMissing({ accountingLabel: "通信費", referenceNumber: " ", referenceUrl: "https://example.test/receipt" }),
    [],
  );
  assert.deepEqual(
    paymentOrganizationMissing({ accountingLabel: null, referenceNumber: null, referenceUrl: null }),
    ["整理用科目", "証憑"],
  );
});

test("支払いがない月の整理率を0として安全に扱う", () => {
  assert.equal(summarizePaymentOrganization([]).completionPercent, 0);
});
