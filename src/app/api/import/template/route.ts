const rows = [
  ["サービス名", "料金", "請求周期", "次回更新日", "カテゴリ", "支払い方法", "サービスURL", "解約URL", "メモ"],
  ["Netflix", "1490", "月額", "2026-08-01", "動画・エンタメ", "メインカード", "https://www.netflix.com/", "https://www.netflix.com/cancelplan", "家族で利用"],
  ["Google One", "250", "月額", "2026-08-10", "クラウド", "メインカード", "https://one.google.com/", "https://one.google.com/settings", "ストレージ"],
];

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function GET() {
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="subsclist-import-template.csv"',
    },
  });
}
