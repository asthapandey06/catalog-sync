export class RetryableError extends Error {
  constructor(message: string, public retryAfterMs?: number) {
    super(message);
    this.name = "RetryableError";
  }
}

export class HttpError extends Error {
  constructor(public status: number, public body: string) {
    super(`HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = "HttpError";
  }
}

export interface RetryOptions {
  attempts?: number;
  baseMs?: number;
  maxMs?: number;
  jitter?: boolean;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : undefined;
}

/** Retries RetryableError with exponential backoff and jitter. Everything else fails immediately. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 5;
  const baseMs = opts.baseMs ?? 500;
  const maxMs = opts.maxMs ?? 20_000;
  const jitter = opts.jitter ?? true;
  const random = opts.random ?? Math.random;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts || !(err instanceof RetryableError)) throw err;
      const exp = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      await sleep(err.retryAfterMs ?? (jitter ? Math.floor(random() * exp) : exp));
    }
  }
}
