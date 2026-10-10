import test from "node:test";
import assert from "node:assert/strict";
import { syncChunk } from "../src/syncChunk";
import type { Product } from "../src/products";
import type { WooLike } from "../src/woo";
import { chunk } from "../src/util/pool";
import { parseCsv, toTable } from "../src/csv";
import { validateRecords } from "../src/products";
import { MemoryHashStore, ProgressTracker } from "../src/progress";

const p = (sku: string): Product => ({ sku, name: sku, regular_price: "1.00", stock_quantity: 1 });

/** A fake store that behaves like WooCommerce: unique SKUs, per-item errors in batch results. */
function fakeWoo(existing: string[] = [], rejectSkus: string[] = []) {
  const ids = new Map(existing.map((s, i) => [s, i + 1]));
  let next = 100;
  const calls = { lookups: 0, batches: 0 };
  const woo: WooLike = {
    async findIdBySku(sku) { calls.lookups++; return ids.get(sku) ?? null; },
    async batch({ create, update }) {
      calls.batches++;
      return {
        create: create.map((c) => rejectSkus.includes(c.sku) ? { id: 0, error: { message: "Invalid or duplicated SKU." } } : (ids.set(c.sku, next), { id: next++ })),
        update: update.map((u) => ({ id: u.id })),
      };
    },
  };
  return { woo, ids, calls };
}

test("creates new SKUs and updates existing ones in a single batch call", async () => {
  const { woo, calls } = fakeWoo(["A"]);
  const r = await syncChunk([p("A"), p("B"), p("C")], woo);
  assert.deepEqual({ created: r.created, updated: r.updated, failed: r.failed }, { created: 2, updated: 1, failed: 0 });
  assert.equal(calls.batches, 1);
  assert.equal(calls.lookups, 3);
});

test("one rejected product does not fail the rest, and the error names the SKU", async () => {
  const { woo } = fakeWoo([], ["B"]);
  const r = await syncChunk([p("A"), p("B"), p("C")], woo);
  assert.equal(r.created, 2);
  assert.equal(r.failed, 1);
  assert.deepEqual(r.errors, [{ sku: "B", error: "Invalid or duplicated SKU." }]);
});

test("running the same import twice creates nothing new the second time", async () => {
  const { woo } = fakeWoo();
  const batch = [p("A"), p("B")];
  assert.equal((await syncChunk(batch, woo)).created, 2);
  const second = await syncChunk(batch, woo);
  assert.deepEqual({ created: second.created, updated: second.updated }, { created: 0, updated: 2 });
});

test("full pipeline: CSV to validated chunks to synced products with progress", async () => {
  const csv = ["sku,name,regular_price,stock_quantity",
    ...Array.from({ length: 120 }, (_, i) => `S${i},Item ${i},${i + 1},3`),
    ",Missing sku,5,1", "DUP,Bad price,abc,1"].join("\n");

  const table = toTable(parseCsv(csv));
  const { valid, invalid } = validateRecords(table.records);
  const chunks = chunk(valid, 50);
  assert.equal(valid.length, 120);
  assert.equal(invalid.length, 2);
  assert.equal(chunks.length, 3);

  const tracker = new ProgressTracker(new MemoryHashStore(), () => 1000);
  await tracker.init("imp1", { totalRows: table.records.length, invalid, totalChunks: chunks.length });
  assert.equal((await tracker.get("imp1"))!.finished, false);

  const { woo, ids } = fakeWoo();
  await Promise.all(chunks.map(async (c) => tracker.chunkDone("imp1", await syncChunk(c, woo))));

  const progress = (await tracker.get("imp1"))!;
  assert.equal(progress.finished, true);
  assert.equal(progress.percent, 100);
  assert.equal(progress.created, 120);
  assert.equal(progress.invalidRows, 2);
  assert.equal(progress.errors.length, 2);
  assert.match(progress.errors[0].error, /^line 122: sku is required/);
  assert.equal(ids.size, 120);
});

test("an import with no valid rows finishes immediately", async () => {
  const tracker = new ProgressTracker(new MemoryHashStore());
  await tracker.init("empty", { totalRows: 1, invalid: [{ line: 2, error: "sku is required" }], totalChunks: 0 });
  const p = (await tracker.get("empty"))!;
  assert.equal(p.finished, true);
  assert.equal(p.percent, 100);
});

test("unknown import ids return null", async () => {
  assert.equal(await new ProgressTracker(new MemoryHashStore()).get("nope"), null);
});
