import { RoomWorkflowEngine } from "./room-workflow.ts";
import { resolveWorkflowStore } from "./resolve-store.ts";
import { inMemoryWorkflowStore } from "./in-memory-workflow-store.ts";

const ENGINE_KEY = Symbol.for("room.workflow.engine.v1");
const ENGINE_PROMISE_KEY = Symbol.for("room.workflow.engine.promise.v1");

function sharedEngine() {
  const root = globalThis as typeof globalThis & { [ENGINE_KEY]?: RoomWorkflowEngine };
  root[ENGINE_KEY] ||= new RoomWorkflowEngine();
  return root[ENGINE_KEY];
}

/**
 * Synchronous in-memory engine, kept for backwards compatibility and offline
 * tooling. API routes should prefer `getRoomWorkflowEngine()` so deployments
 * with D1/R2 bindings automatically get durable, restart-safe runs.
 */
export const roomWorkflowEngine = sharedEngine();

/**
 * Resolves the engine against the current runtime bindings. The result is
 * cached per process; when no D1/R2 bindings exist it returns the shared
 * in-memory engine.
 */
export async function getRoomWorkflowEngine(): Promise<RoomWorkflowEngine> {
  const root = globalThis as typeof globalThis & { [ENGINE_PROMISE_KEY]?: Promise<RoomWorkflowEngine> };
  root[ENGINE_PROMISE_KEY] ||= (async () => {
    const store = await resolveWorkflowStore();
    if (store === inMemoryWorkflowStore) return sharedEngine();
    return new RoomWorkflowEngine(store);
  })();
  return root[ENGINE_PROMISE_KEY];
}
