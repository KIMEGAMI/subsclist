const rows = [
  ["利用日", "摘要", "金額"],
  ["2026-06-01", "NETFLIX.COM", "1490"],
  ["2026-06-03", "APPLE.COM/BILL", "1080"],
  ["2026-06-08", "GOOGLE ONE", "250"],
  ["2026-06-15", "SPOTIFY", "980"],
  ["2026-07-01", "NETFLIX.COM", "1490"],
  ["2026-07-03", "APPLE.COM/BILL", "1080"],
];

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function GET() {
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="subsclist-statement-sample.csv"',
    },
  });
}
