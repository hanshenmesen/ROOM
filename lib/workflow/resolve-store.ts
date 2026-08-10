import type { AnyD1Database } from "drizzle-orm/d1";
import { createD1WorkflowMetadataStore } from "./d1-metadata-store.ts";
import { DurableWorkflowStore } from "./durable-workflow-store.ts";
import { inMemoryWorkflowStore } from "./in-memory-workflow-store.ts";
import { R2ObjectStore, type R2BucketLike } from "./object-store.ts";
import type { WorkflowStore } from "./types.ts";

/**
 * Resolves the Workflow store for the current runtime.
 *
 * When the deployment provides both a D1 binding (`DB`) and a private R2
 * binding (`WORKFLOW_OBJECTS`) — via `.openai/hosting.json` `d1` / `r2`
 * fields or platform secrets — runs become recoverable across process
 * restarts. Otherwise the engine falls back to the in-memory store, and the
 * public snapshot keeps reporting `survivesProcessRestart: false`.
 *
 * The `cloudflare:workers` import is dynamic so the module graph still loads
 * under plain `node --test` outside the Worker runtime.
 */
export async function resolveWorkflowStore(): Promise<WorkflowStore> {
  try {
    const { env } = await import("cloudflare:workers");
    const db = env.DB;
    const objects = env.WORKFLOW_OBJECTS;
    if (db && objects) {
      return new DurableWorkflowStore(
        createD1WorkflowMetadataStore(db as AnyD1Database),
        new R2ObjectStore(objects as R2BucketLike),
      );
    }
  } catch {
    // Not running inside the Worker runtime (tests, local tooling).
  }
  return inMemoryWorkflowStore;
}
