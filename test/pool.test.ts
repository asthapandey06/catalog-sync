import test from "node:test";
import assert from "node:assert/strict";
import { chunk, mapLimit } from "../src/util/pool";

test("splits into batches, last one may be smaller", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 3), []);
  assert.throws(() => chunk([1], 0));
});

test("mapLimit keeps order and never exceeds the concurrency limit", async () => {
  let running = 0, peak = 0;
  const out = await mapLimit([5, 1, 4, 2, 3, 6], 2, async (n) => {
    running++; peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, n));
    running--;
    return n * 10;
  });
  assert.deepEqual(out, [50, 10, 40, 20, 30, 60]);
  assert.equal(peak, 2);
});
