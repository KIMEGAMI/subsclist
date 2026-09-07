const FORMULA_PREFIX = /^[\t\r\n ]*[=+\-@]/;

export function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  if (quoted) throw new Error("CSVの引用符が閉じられていません。");
  row.push(current.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function serializeCsvCell(value: string) {
  const safeValue = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}
