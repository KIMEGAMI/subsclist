const rows = [
  ["サービス名", "料金", "請求周期", "次回更新日", "カテゴリ", "支払い方法", "サービスURL", "解約URL", "メモ", "カスタム周期日数", "仕事利用割合", "請求元", "請求通貨", "原通貨額", "円換算レート", "換算レート確認日"],
  ["Netflix", "1490", "月額", "2026-08-01", "動画・エンタメ", "メインカード", "https://www.netflix.com/", "https://www.netflix.com/cancelplan", "家族で利用", "", "0", "DIRECT", "JPY", "", "", ""],
  ["Google One", "250", "月額", "2026-08-10", "クラウド", "メインカード", "https://one.google.com/", "https://one.google.com/settings", "仕事用ストレージ", "", "100", "GOOGLE_PLAY", "JPY", "", "", ""],
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
