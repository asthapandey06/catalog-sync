import type { InvalidRow } from "./products";
import type { ChunkResult } from "./syncChunk";

/** The few hash/list operations progress tracking needs. Redis in production, memory in tests. */
export interface HashStore {
  hset(key: string, fields: Record<string, string | number>): Promise<void>;
  hincrby(key: string, field: string, by: number): Promise<number>;
  hgetall(key: string): Promise<Record<string, string>>;
  rpush(key: string, values: string[], max: number): Promise<void>;
  lrange(key: string): Promise<string[]>;
}

export interface ImportProgress {
  id: string;
  totalRows: number;
  invalidRows: number;
  totalChunks: number;
  doneChunks: number;
  percent: number;
  created: number;
  updated: number;
  failed: number;
  finished: boolean;
  startedAt: number;
  finishedAt: number | null;
  errors: { sku?: string; error: string }[];
}

const MAX_ERRORS = 200;

export class ProgressTracker {
  constructor(private h: HashStore, private now: () => number = Date.now) {}

  private key = (id: string) => `import:${id}`;

  async init(id: string, info: { totalRows: number; invalid: InvalidRow[]; totalChunks: number }) {
    await this.h.hset(this.key(id), {
      totalRows: info.totalRows,
      invalidRows: info.invalid.length,
      totalChunks: info.totalChunks,
      doneChunks: 0, created: 0, updated: 0, failed: 0,
      startedAt: this.now(),
      ...(info.totalChunks === 0 ? { finishedAt: this.now() } : {}),
    });
    if (info.invalid.length > 0) {
      await this.h.rpush(
        `${this.key(id)}:errors`,
        info.invalid.map((r) => JSON.stringify({ sku: r.sku, error: `line ${r.line}: ${r.error}` })),
        MAX_ERRORS
      );
    }
  }

  async chunkDone(id: string, r: ChunkResult) {
    const k = this.key(id);
    await this.h.hincrby(k, "created", r.created);
    await this.h.hincrby(k, "updated", r.updated);
    await this.h.hincrby(k, "failed", r.failed);
    if (r.errors.length > 0) await this.h.rpush(`${k}:errors`, r.errors.map((e) => JSON.stringify(e)), MAX_ERRORS);
    const done = await this.h.hincrby(k, "doneChunks", 1); // last, so "finished" implies all counts are in
    const total = Number((await this.h.hgetall(k)).totalChunks);
    if (done >= total) await this.h.hset(k, { finishedAt: this.now() });
  }

  async get(id: string): Promise<ImportProgress | null> {
    const f = await this.h.hgetall(this.key(id));
    if (!f.totalChunks && f.totalChunks !== "0") return null;
    const totalChunks = Number(f.totalChunks);
    const doneChunks = Number(f.doneChunks);
    const errors = (await this.h.lrange(`${this.key(id)}:errors`)).map((s) => JSON.parse(s));
    return {
      id,
      totalRows: Number(f.totalRows),
      invalidRows: Number(f.invalidRows),
      totalChunks,
      doneChunks,
      percent: totalChunks === 0 ? 100 : Math.round((doneChunks / totalChunks) * 100),
      created: Number(f.created),
      updated: Number(f.updated),
      failed: Number(f.failed),
      finished: !!f.finishedAt,
      startedAt: Number(f.startedAt),
      finishedAt: f.finishedAt ? Number(f.finishedAt) : null,
      errors,
    };
  }
}

export class MemoryHashStore implements HashStore {
  private hashes = new Map<string, Record<string, string>>();
  private lists = new Map<string, string[]>();
  async hset(key: string, fields: Record<string, string | number>) {
    const h = this.hashes.get(key) ?? {};
    for (const [k, v] of Object.entries(fields)) h[k] = String(v);
    this.hashes.set(key, h);
  }
  async hincrby(key: string, field: string, by: number) {
    const h = this.hashes.get(key) ?? {};
    h[field] = String(Number(h[field] ?? 0) + by);
    this.hashes.set(key, h);
    return Number(h[field]);
  }
  async hgetall(key: string) { return { ...(this.hashes.get(key) ?? {}) }; }
  async rpush(key: string, values: string[], max: number) {
    this.lists.set(key, [...(this.lists.get(key) ?? []), ...values].slice(0, max));
  }
  async lrange(key: string) { return [...(this.lists.get(key) ?? [])]; }
}

export class RedisHashStore implements HashStore {
  constructor(private r: any, private ttlSeconds = 7 * 24 * 3600) {}
  async hset(key: string, fields: Record<string, string | number>) {
    await this.r.hset(key, fields);
    await this.r.expire(key, this.ttlSeconds);
  }
  hincrby(key: string, field: string, by: number): Promise<number> { return this.r.hincrby(key, field, by); }
  hgetall(key: string): Promise<Record<string, string>> { return this.r.hgetall(key); }
  async rpush(key: string, values: string[], max: number) {
    await this.r.rpush(key, ...values);
    await this.r.ltrim(key, 0, max - 1);
    await this.r.expire(key, this.ttlSeconds);
  }
  lrange(key: string): Promise<string[]> { return this.r.lrange(key, 0, -1); }
}
