import { Worker } from "bullmq";
import { config } from "./config";
import { ProgressTracker, RedisHashStore } from "./progress";
import { connection, QUEUE_NAME, ChunkJob } from "./queue";
import { syncChunk } from "./syncChunk";
import { WooClient } from "./woo";

const tracker = new ProgressTracker(new RedisHashStore(connection));
const woo = new WooClient({ baseUrl: config.WOO_BASE_URL, key: config.WOO_CONSUMER_KEY, secret: config.WOO_CONSUMER_SECRET });

const worker = new Worker(
  QUEUE_NAME,
  async (job: { data: ChunkJob; attemptsMade: number }) => {
    const { importId, index, products } = job.data;
    const result = await syncChunk(products, woo);
    await tracker.chunkDone(importId, result);
    console.log(`[${importId.slice(0, 8)}] chunk ${index}: +${result.created} created, ${result.updated} updated, ${result.failed} failed`);
    return result;
  },
  { connection, concurrency: config.WORKER_CONCURRENCY }
);

// If a chunk still fails after all its retries, count its rows as failed so the import can finish.
worker.on("failed", (job: any, err: Error) => {
  if (!job) return;
  const attempts = job.opts?.attempts ?? 1;
  console.error(`[${job.data.importId.slice(0, 8)}] chunk ${job.data.index} failed (attempt ${job.attemptsMade}/${attempts}): ${err.message}`);
  if (job.attemptsMade >= attempts) {
    tracker.chunkDone(job.data.importId, {
      created: 0,
      updated: 0,
      failed: job.data.products.length,
      errors: [{ error: `chunk ${job.data.index} gave up after ${attempts} attempts: ${err.message}` }],
    }).catch((e: Error) => console.error("could not record failed chunk", e));
  }
});

console.log(`Worker started with concurrency ${config.WORKER_CONCURRENCY}`);
