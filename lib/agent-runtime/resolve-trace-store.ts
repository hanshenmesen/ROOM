import { inMemoryTraceStore } from "./in-memory-trace-store.ts";
import { DurableTraceStore, type TraceStore } from "./trace-store.ts";
import { R2ObjectStore, type R2BucketLike } from "../workflow/object-store.ts";

/**
 * Resolves the `TraceStore` for the current runtime, mirroring
 * `resolveWorkflowStore()`'s binding-detection pattern: when the deployment
 * provides a private R2 binding (`WORKFLOW_OBJECTS`), Run traces become
 * recoverable across process restarts via `DurableTraceStore`. Otherwise
 * this falls back to the shared `inMemoryTraceStore` -- the same store
 * every trace read today (the fleet metrics panel, `/api/agent-runs/*`)
 * already depends on, so this is purely an additive durability upgrade,
 * not a behavior change for existing deployments.
 *
 * The `cloudflare:workers` import is dynamic so the module graph still
 * loads under plain `node --test` outside the Worker runtime.
 */
export async function resolveTraceStore(): Promise<TraceStore> {
  try {
    const { env } = await import("cloudflare:workers");
    const objects = env.WORKFLOW_OBJECTS;
    if (objects) return new DurableTraceStore(new R2ObjectStore(objects as R2BucketLike));
  } catch {
    // Not running inside the Worker runtime (tests, local tooling).
  }
  return inMemoryTraceStore;
}
