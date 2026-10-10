import { Queue } from "bullmq";
import IORedis from "ioredis";
import { config } from "./config";
import type { Product } from "./products";

export const QUEUE_NAME = "catalog-sync";

export interface ChunkJob {
  importId: string;
  index: number;
  products: Product[];
}

export const connection = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });

export const queue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: 500,
    removeOnFail: 2000,
  },
});
