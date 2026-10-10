/**
 * A tiny fake WooCommerce store so the whole project runs without WordPress.
 * It checks credentials, enforces unique SKUs, and randomly answers 429 to show retries working.
 */
import express from "express";

const port = Number(process.env.MOCK_PORT ?? 4000);
const failRate = Number(process.env.MOCK_FAIL_RATE ?? 0.1);
const products = new Map<number, any>();
const bySku = new Map<string, number>();
let nextId = 1000;
let throttled = 0;

const app = express();
app.use(express.json({ limit: "5mb" }));

app.use((req: any, res: any, next: any) => {
  if (req.path === "/stats") return next();
  if (!(req.headers.authorization ?? "").startsWith("Basic ")) {
    return res.status(401).json({ code: "woocommerce_rest_cannot_view", message: "Missing credentials" });
  }
  if (Math.random() < failRate) {
    throttled++;
    res.setHeader("Retry-After", "1");
    return res.status(429).json({ code: "too_many_requests", message: "Slow down" });
  }
  next();
});

app.get("/wp-json/wc/v3/products", (req: any, res: any) => {
  const id = bySku.get(String(req.query.sku ?? ""));
  res.json(id ? [products.get(id)] : []);
});

app.post("/wp-json/wc/v3/products/batch", (req: any, res: any) => {
  const out: { create: any[]; update: any[] } = { create: [], update: [] };

  for (const p of req.body.create ?? []) {
    if (!p.sku || bySku.has(p.sku)) {
      out.create.push({ id: 0, error: { code: "product_invalid_sku", message: "Invalid or duplicated SKU." } });
      continue;
    }
    const id = nextId++;
    products.set(id, { ...p, id });
    bySku.set(p.sku, id);
    out.create.push(products.get(id));
  }
  for (const p of req.body.update ?? []) {
    if (!products.has(p.id)) {
      out.update.push({ id: p.id, error: { code: "woocommerce_rest_product_invalid_id", message: "Invalid ID." } });
      continue;
    }
    products.set(p.id, { ...products.get(p.id), ...p });
    out.update.push(products.get(p.id));
  }
  res.json(out);
});

app.get("/stats", (_req: any, res: any) => res.json({ products: products.size, throttledRequests: throttled }));

app.listen(port, () => console.log(`Mock WooCommerce listening on :${port} (fail rate ${failRate})`));
