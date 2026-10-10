import test from "node:test";
import assert from "node:assert/strict";
import { missingColumns, validateRecords } from "../src/products";

const rec = (line: number, values: Record<string, string>) => ({ line, values });

test("accepts a good row and normalises prices", () => {
  const { valid, invalid } = validateRecords([rec(2, { sku: "A1", name: "Mug", regular_price: "9.5", stock_quantity: "4" })]);
  assert.equal(invalid.length, 0);
  assert.deepEqual(valid[0], { sku: "A1", name: "Mug", regular_price: "9.50", stock_quantity: 4 });
});

test("reports each problem with its line number and reason", () => {
  const { valid, invalid } = validateRecords([
    rec(2, { sku: "", name: "No sku", regular_price: "5" }),
    rec(3, { sku: "B", name: "Bad price", regular_price: "ten" }),
    rec(4, { sku: "C", name: "Sale too high", regular_price: "5", sale_price: "6" }),
    rec(5, { sku: "D", name: "Bad stock", regular_price: "5", stock_quantity: "1.5" }),
    rec(6, { sku: "E", name: "", regular_price: "5" }),
  ]);
  assert.equal(valid.length, 0);
  assert.deepEqual(invalid.map((i) => i.line), [2, 3, 4, 5, 6]);
  assert.match(invalid[2].error, /sale_price must be lower/);
});

test("flags a repeated SKU inside the same file", () => {
  const { valid, invalid } = validateRecords([
    rec(2, { sku: "A", name: "One", regular_price: "1" }),
    rec(3, { sku: "A", name: "Two", regular_price: "2" }),
  ]);
  assert.equal(valid.length, 1);
  assert.equal(invalid[0].error, "duplicate sku in this file");
});

test("detects missing required columns", () => {
  assert.deepEqual(missingColumns(["sku", "name"]), ["regular_price"]);
  assert.deepEqual(missingColumns(["sku", "name", "regular_price", "extra"]), []);
});
