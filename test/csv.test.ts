import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, toTable } from "../src/csv";

test("parses quoted fields, commas, escaped quotes and line breaks inside quotes", () => {
  const rows = parseCsv('a,b,c\n1,"hello, world","say ""hi"""\n2,"line1\nline2",x\n');
  assert.deepEqual(rows, [["a", "b", "c"], ["1", "hello, world", 'say "hi"'], ["2", "line1\nline2", "x"]]);
});

test("handles Windows line endings, a BOM and blank lines", () => {
  const rows = parseCsv("\uFEFFa,b\r\n1,2\r\n\r\n3,4");
  assert.deepEqual(rows, [["a", "b"], ["1", "2"], ["3", "4"]]);
});

test("builds records keyed by lowercase header, with file line numbers", () => {
  const t = toTable(parseCsv("SKU, Name\nA1,Mug\nA2,Cap"));
  assert.deepEqual(t.headers, ["sku", "name"]);
  assert.equal(t.records[1].line, 3);
  assert.equal(t.records[0].values.name, "Mug");
});

test("short rows get empty strings instead of crashing", () => {
  const t = toTable(parseCsv("a,b,c\n1"));
  assert.equal(t.records[0].values.c, "");
});
