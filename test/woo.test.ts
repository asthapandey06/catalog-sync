import test from "node:test";
import assert from "node:assert/strict";
import { WooClient } from "../src/woo";
import { HttpError } from "../src/util/retry";

const cfg = { baseUrl: "https://shop.test", key: "ck", secret: "cs" };
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

test("sends basic auth and finds a product id by SKU", async () => {
  let url = "", auth = "";
  const woo = new WooClient(cfg, async (u, init) => {
    url = String(u); auth = (init!.headers as Record<string, string>).Authorization;
    return json([{ id: 42 }]);
  });
  assert.equal(await woo.findIdBySku("A B"), 42);
  assert.equal(url, "https://shop.test/wp-json/wc/v3/products?sku=A%20B");
  assert.equal(auth, "Basic " + Buffer.from("ck:cs").toString("base64"));
});

test("returns null when the SKU does not exist", async () => {
  const woo = new WooClient(cfg, async () => json([]));
  assert.equal(await woo.findIdBySku("nope"), null);
});

test("retries a 429 after the Retry-After delay and then succeeds", async () => {
  const delays: number[] = [];
  let calls = 0;
  const woo = new WooClient(cfg, async () => ++calls === 1 ? json({}, 429, { "retry-after": "1" }) : json([{ id: 7 }]),
    { sleep: async (ms) => void delays.push(ms) });
  assert.equal(await woo.findIdBySku("A"), 7);
  assert.deepEqual(delays, [1000]);
});

test("bad credentials fail straight away without retrying", async () => {
  let calls = 0;
  const woo = new WooClient(cfg, async () => { calls++; return json({ message: "nope" }, 401); }, { sleep: async () => {} });
  await assert.rejects(woo.findIdBySku("A"), HttpError);
  assert.equal(calls, 1);
});
