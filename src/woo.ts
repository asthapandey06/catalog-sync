import { HttpError, RetryableError, RetryOptions, parseRetryAfter, withRetry } from "./util/retry";

export interface WooConfig {
  baseUrl: string;
  key: string;
  secret: string;
}

/** What the sync logic needs from WooCommerce. Easy to fake in tests. */
export interface WooLike {
  findIdBySku(sku: string): Promise<number | null>;
  batch(payload: { create: any[]; update: any[] }): Promise<{ create?: any[]; update?: any[] }>;
}

export class WooClient implements WooLike {
  constructor(private cfg: WooConfig, private fetchImpl: typeof fetch = fetch, private retry: RetryOptions = {}) {}

  private call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const auth = Buffer.from(`${this.cfg.key}:${this.cfg.secret}`).toString("base64");
    return withRetry(async () => {
      const res = await this.fetchImpl(this.cfg.baseUrl + path, {
        method,
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      // 429 and 5xx are temporary: retry. Other errors (bad credentials, bad data) are not.
      if (res.status === 429 || res.status >= 500) {
        throw new RetryableError(`WooCommerce ${res.status}`, parseRetryAfter(res.headers.get("retry-after")));
      }
      if (!res.ok) throw new HttpError(res.status, await res.text());
      return (await res.json()) as T;
    }, this.retry);
  }

  async findIdBySku(sku: string): Promise<number | null> {
    const found = await this.call<{ id: number }[]>("GET", `/wp-json/wc/v3/products?sku=${encodeURIComponent(sku)}`);
    return found.length > 0 ? found[0].id : null;
  }

  batch(payload: { create: any[]; update: any[] }) {
    return this.call<{ create?: any[]; update?: any[] }>("POST", "/wp-json/wc/v3/products/batch", payload);
  }
}
