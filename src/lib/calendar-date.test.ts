import assert from "node:assert/strict";
import test from "node:test";
import { parseIsoCalendarDate } from "./calendar-date.ts";

test("実在するISO暦日をUTCの開始日として解析する", () => {
  assert.equal(parseIsoCalendarDate("2026-08-12")?.toISOString(), "2026-08-12T00:00:00.000Z");
});

test("存在しない日付や異なる形式を拒否する", () => {
  assert.equal(parseIsoCalendarDate("2026-02-30"), null);
  assert.equal(parseIsoCalendarDate("2026/08/12"), null);
  assert.equal(parseIsoCalendarDate("invalid"), null);
});
