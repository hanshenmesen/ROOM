/**
 * Server-side cancellation registry for in-flight Agent runs.
 *
 * Client-side fetch aborts do not reliably stop the server handler (the
 * runtime may let it run to completion), and a run that keeps going holds
 * its concurrency lease the whole time -- cancelling and retrying quickly
 * exhausted the per-client slots and surfaced a misleading "当前 Agent
 * 任务较多" 429. Registering each run's AbortSignal here lets an explicit
 * cancel call stop the run immediately and release the lease.
 */

const REGISTRY_KEY = Symbol.for("room.agent-runtime.run-cancellation.v1");
// Backstop so a crashed handler cannot leak a registry entry forever.
const REGISTRATION_TTL_MS = 60 * 60_000;

type RegistryEntry = { controller: AbortController; expiresAt: number };
type Registry = Map<string, RegistryEntry>;

function registry(): Registry {
  const root = globalThis as typeof globalThis & { [REGISTRY_KEY]?: Registry };
  root[REGISTRY_KEY] ||= new Map();
  const entries = root[REGISTRY_KEY];
  const now = Date.now();
  for (const [runId, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(runId);
  }
  return entries;
}

/**
 * Registers a cancellation controller for `runId` and returns the signal
 * the run should operate on. The returned signal aborts when either the
 * upstream signal (typically the incoming request's) fires or an explicit
 * cancelAgentRunById() call arrives. Always pair with unregister() in a
 * finally block.
 */
export function registerAgentRunSignal(runId: string, upstream?: AbortSignal) {
  const controller = new AbortController();
  const onUpstreamAbort = () => controller.abort(upstream?.reason);
  if (upstream) {
    if (upstream.aborted) controller.abort(upstream.reason);
    else upstream.addEventListener("abort", onUpstreamAbort, { once: true });
  }
  registry().set(runId, { controller, expiresAt: Date.now() + REGISTRATION_TTL_MS });
  return {
    signal: controller.signal,
    unregister: () => {
      upstream?.removeEventListener("abort", onUpstreamAbort);
      registry().delete(runId);
    },
  };
}

/** Aborts the run registered under `runId`. Returns false when no such active run exists. */
export function cancelAgentRunById(runId: string) {
  const entry = registry().get(runId);
  if (!entry) return false;
  entry.controller.abort(new DOMException("Run cancelled by user", "AbortError"));
  registry().delete(runId);
  return true;
}

/** Test helper: drops every registration. */
export function clearAgentRunCancellationsForTests() {
  registry().clear();
}
