import assert from "node:assert/strict";
import test from "node:test";
import { parseCsvRows, serializeCsvCell } from "./csv.ts";

test("parseCsvRows parses quoted commas and escaped quotes", () => {
  assert.deepEqual(parseCsvRows('name,memo\n"Example, Inc.","a ""quote"""'), [
    ["name", "memo"],
    ["Example, Inc.", 'a "quote"'],
  ]);
});

test("parseCsvRows rejects an unclosed quote", () => {
  assert.throws(() => parseCsvRows('name\n"unfinished'), /引用符/);
});

test("serializeCsvCell escapes quotes and neutralizes spreadsheet formulas", () => {
  assert.equal(serializeCsvCell('normal "value"'), '"normal ""value"""');
  assert.equal(serializeCsvCell("=1+1"), '"\'=1+1"');
  assert.equal(serializeCsvCell("  @SUM(A1:A2)"), '"\'  @SUM(A1:A2)"');
});
