import { Product, toWooPayload } from "./products";
import { mapLimit } from "./util/pool";
import type { WooLike } from "./woo";

export interface ChunkResult {
  created: number;
  updated: number;
  failed: number;
  errors: { sku?: string; error: string }[];
}

/**
 * Syncs one chunk of products:
 *  1. Looks up which SKUs already exist (a few lookups at a time)
 *  2. Sends ONE batch request: new SKUs are created, existing ones are updated
 *  3. Reads the per-item results, so one bad product never fails the whole chunk
 * Running it twice with the same data gives the same end state (safe to re-run).
 */
export async function syncChunk(products: Product[], woo: WooLike, lookupConcurrency = 10): Promise<ChunkResult> {
  const ids = await mapLimit(products, lookupConcurrency, (p) => woo.findIdBySku(p.sku));

  const create: { sku: string; body: any }[] = [];
  const update: { sku: string; body: any }[] = [];
  products.forEach((p, i) => {
    const id = ids[i];
    if (id === null) create.push({ sku: p.sku, body: toWooPayload(p) });
    else update.push({ sku: p.sku, body: { id, ...toWooPayload(p) } });
  });

  const res = await woo.batch({ create: create.map((c) => c.body), update: update.map((u) => u.body) });

  const result: ChunkResult = { created: 0, updated: 0, failed: 0, errors: [] };
  const tally = (items: any[] | undefined, sent: { sku: string }[], kind: "created" | "updated") => {
    sent.forEach((s, i) => {
      const item = items?.[i];
      if (!item || item.error) {
        result.failed++;
        result.errors.push({ sku: s.sku, error: item?.error?.message ?? "No result returned for this product" });
      } else result[kind]++;
    });
  };
  tally(res.create, create, "created");
  tally(res.update, update, "updated");
  return result;
}
