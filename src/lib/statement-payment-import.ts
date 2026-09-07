export type StatementPaymentImportState = "ACTIVE" | "PARTIAL" | "UNDONE";

export type StatementPaymentImportSummary = {
  importedCount: number;
  remainingCount: number;
  undoneAt: Date | string | null;
  undoneCount: number | null;
};

export function statementPaymentImportState(
  summary: StatementPaymentImportSummary,
): StatementPaymentImportState {
  if (summary.undoneAt) return "UNDONE";
  if (summary.remainingCount < summary.importedCount) return "PARTIAL";
  return "ACTIVE";
}

export function statementPaymentImportStatusLabel(
  summary: StatementPaymentImportSummary,
) {
  const state = statementPaymentImportState(summary);
  if (state === "UNDONE") {
    return `${summary.undoneCount ?? 0}件を取り消し済み`;
  }
  if (state === "PARTIAL") {
    return `残り${Math.max(0, summary.remainingCount)}件 / 登録時${summary.importedCount}件`;
  }
  return `${summary.importedCount}件を登録中`;
}
