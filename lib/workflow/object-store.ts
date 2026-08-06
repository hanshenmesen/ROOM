/**
 * Object storage boundary for durable Workflow bodies.
 *
 * Durable runs keep only queryable metadata in D1. Large or sensitive bodies
 * (full run state including Artifact bodies, source input, and the event log)
 * live in object storage, mirroring the production design where a private R2
 * bucket holds bodies and D1 holds references. Bodies never contain API keys:
 * the Workflow layer only sees source text and validated Artifacts.
 */

/** Minimal structural subset of the Cloudflare R2 Bucket API used by ROOM. */
export type R2BucketLike = {
  put(key: string, value: string): Promise<unknown>;
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: {
    prefix?: string;
    cursor?: string;
  }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
};

export type WorkflowObjectStore = {
  put(key: string, body: string): Promise<void>;
  get(key: string): Promise<string | undefined>;
  delete(key: string): Promise<void>;
  clear?(): Promise<void>;
};

/** Volatile object store used by tests and local development. */
export class InMemoryObjectStore implements WorkflowObjectStore {
  private readonly objects = new Map<string, string>();

  async put(key: string, body: string) {
    this.objects.set(key, body);
  }

  async get(key: string) {
    return this.objects.get(key);
  }

  async delete(key: string) {
    this.objects.delete(key);
  }

  async clear() {
    this.objects.clear();
  }

  /** Test helper: list stored keys without exposing bodies. */
  keys() {
    return [...this.objects.keys()];
  }
}

/**
 * R2-backed object store. All keys are namespaced under one prefix so a
 * dedicated private bucket (or bucket prefix) can be retained and cleaned up
 * without touching unrelated objects.
 */
export class R2ObjectStore implements WorkflowObjectStore {
  private readonly bucket: R2BucketLike;
  private readonly prefix: string;

  constructor(bucket: R2BucketLike, prefix = "workflow/v1/") {
    this.bucket = bucket;
    this.prefix = prefix;
  }

  private objectKey(key: string) {
    return `${this.prefix}${key}`;
  }

  async put(key: string, body: string) {
    await this.bucket.put(this.objectKey(key), body);
  }

  async get(key: string) {
    const object = await this.bucket.get(this.objectKey(key));
    return object ? object.text() : undefined;
  }

  async delete(key: string) {
    await this.bucket.delete(this.objectKey(key));
  }

  async clear() {
    let cursor: string | undefined;
    do {
      const page = await this.bucket.list({ prefix: this.prefix, cursor });
      const keys = page.objects.map((object) => object.key);
      if (keys.length > 0) await this.bucket.delete(keys);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
}
