"use client";

export function PrintPageButton({ subject = "月次レポート" }: { subject?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn-secondary print-hidden"
      aria-label={`${subject}を印刷またはPDF保存`}
    >
      印刷・PDF保存
    </button>
  );
}
