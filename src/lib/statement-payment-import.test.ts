import assert from "node:assert/strict";
import test from "node:test";
import {
  statementPaymentImportState,
  statementPaymentImportStatusLabel,
} from "./statement-payment-import.ts";

test("全件が残る取込を登録中として表示する", () => {
  const summary = { importedCount: 5, remainingCount: 5, undoneAt: null, undoneCount: null };
  assert.equal(statementPaymentImportState(summary), "ACTIVE");
  assert.equal(statementPaymentImportStatusLabel(summary), "5件を登録中");
});

test("個別削除後は残存件数を表示する", () => {
  const summary = { importedCount: 5, remainingCount: 3, undoneAt: null, undoneCount: null };
  assert.equal(statementPaymentImportState(summary), "PARTIAL");
  assert.equal(statementPaymentImportStatusLabel(summary), "残り3件 / 登録時5件");
});

test("取り消し済みは実際に削除した件数を表示する", () => {
  const summary = {
    importedCount: 5,
    remainingCount: 0,
    undoneAt: "2026-08-31T00:00:00.000Z",
    undoneCount: 4,
  };
  assert.equal(statementPaymentImportState(summary), "UNDONE");
  assert.equal(statementPaymentImportStatusLabel(summary), "4件を取り消し済み");
});
