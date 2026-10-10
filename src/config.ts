import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  WOO_BASE_URL: z.string().default("http://localhost:4000"),
  WOO_CONSUMER_KEY: z.string().default("ck_demo"),
  WOO_CONSUMER_SECRET: z.string().default("cs_demo"),
  CHUNK_SIZE: z.coerce.number().int().min(1).max(100).default(50), // WooCommerce batch limit is 100
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(5),
});

export const config = schema.parse(process.env);
