import express from "express";
import { randomUUID } from "crypto";
import { config } from "./config";
import { parseCsv, toTable } from "./csv";
import { missingColumns, validateRecords } from "./products";
import { ProgressTracker, RedisHashStore } from "./progress";
import { queue, connection, ChunkJob } from "./queue";
import { chunk } from "./util/pool";

const tracker = new ProgressTracker(new RedisHashStore(connection));
const app = express();

const wrap = (fn: (req: any, res: any) => Promise<unknown>) => (req: any, res: any, next: any) => fn(req, res).catch(next);

app.get("/health", (_req, res) => res.json({ ok: true }));

// Send the CSV as the request body (Content-Type: text/csv). Returns immediately; work happens in the background.
app.post("/imports", express.text({ type: ["text/csv", "text/plain"], limit: "10mb" }), wrap(async (req, res) => {
  if (typeof req.body !== "string" || req.body.trim() === "") {
    return res.status(400).json({ error: "Send the CSV as the request body with Content-Type: text/csv" });
  }

  const table = toTable(parseCsv(req.body));
  const missing = missingColumns(table.headers);
  if (missing.length > 0) return res.status(400).json({ error: `Missing required columns: ${missing.join(", ")}` });

  const { valid, invalid } = validateRecords(table.records);
  const chunks = chunk(valid, config.CHUNK_SIZE);
  const id = randomUUID();

  await tracker.init(id, { totalRows: table.records.length, invalid, totalChunks: chunks.length });
  if (chunks.length > 0) {
    await queue.addBulk(chunks.map((products, index) => ({ name: "chunk", data: { importId: id, index, products } as ChunkJob })));
  }

  res.status(202).json({
    id,
    totalRows: table.records.length,
    validRows: valid.length,
    invalidRows: invalid.length,
    chunks: chunks.length,
    statusUrl: `/imports/${id}`,
  });
}));

app.get("/imports/:id", wrap(async (req, res) => {
  const progress = await tracker.get(req.params.id);
  if (!progress) return res.status(404).json({ error: "Import not found" });
  res.json(progress);
}));

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(err.status === 413 ? 413 : 500).json({ error: err.status === 413 ? "File too large (10 MB max)" : "Internal error" });
});

app.listen(config.PORT, () => console.log(`API listening on :${config.PORT}`));
