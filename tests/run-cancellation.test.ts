import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import {
  cancelAgentRunById,
  clearAgentRunCancellationsForTests,
  registerAgentRunSignal,
} from "../lib/agent-runtime/run-cancellation.ts";
import { extractProfileWithAgentRun } from "../lib/agents/profile-agent.ts";
// Internal gateway identifiers are injected via env; tests use placeholders.
process.env.INTERNAL_MAAS_HOST = "internal-maas.example";
process.env.INTERNAL_MAAS_APP_ID = "test-app-id";


const routeAliases: Record<string, string> = {
  "@/lib/agent-runtime/run-cancellation": new URL("../lib/agent-runtime/run-cancellation.ts", import.meta.url).href,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (routeAliases[specifier]) return { url: routeAliases[specifier], shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const cancelRoute = await import(new URL("../app/api/agent-runs/[runId]/cancel/route.ts", import.meta.url).href);

test.beforeEach(() => {
  clearAgentRunCancellationsForTests();
});

test("registered runs abort on cancel and unregister cleanly", () => {
  const registration = registerAgentRunSignal("run-cancel-unit");
  assert.equal(registration.signal.aborted, false);
  assert.equal(cancelAgentRunById("run-cancel-unit"), true);
  assert.equal(registration.signal.aborted, true);
  assert.equal((registration.signal.reason as DOMException).name, "AbortError");
  // The entry is gone: a second cancel reports no active run.
  assert.equal(cancelAgentRunById("run-cancel-unit"), false);
  registration.unregister();
});

test("unknown runs report not-found and upstream aborts propagate", () => {
  assert.equal(cancelAgentRunById("run-does-not-exist"), false);
  const upstream = new AbortController();
  const registration = registerAgentRunSignal("run-upstream", upstream.signal);
  upstream.abort();
  assert.equal(registration.signal.aborted, true);
  registration.unregister();
  assert.equal(cancelAgentRunById("run-upstream"), false);
});

test("the cancel endpoint stops a hung agent run instead of waiting for the model timeout", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.MAAS_API_KEY;
  process.env.MAAS_API_KEY = "test-key";
  // A provider that never answers on its own: the fetch only settles when
  // the request signal aborts, like a hung gateway connection.
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
  })) as typeof fetch;

  const runId = "run-cancel-e2e";
  const startedAt = performance.now();
  try {
    // Mirror the production wiring: the route registers the run id and
    // drives the agent on the registration's signal.
    const registration = registerAgentRunSignal(runId);
    const pending = extractProfileWithAgentRun("林遥\nAgent 工程师", undefined, {
      runId,
      signal: registration.signal,
      providerConfig: { maasApiKey: "test-key", maasBaseUrl: "https://internal-maas.example" },
    });
    void pending.catch(() => {});
    // Give the run a moment to reach its in-flight fetch, then cancel via
    // the HTTP endpoint exactly like the browser's cancel button does.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const response = await cancelRoute.POST(new Request("https://room.test"), {
      params: Promise.resolve({ runId }),
    });
    assert.equal(response.status, 200);
    registration.unregister();

    await assert.rejects(pending, (error: unknown) => {
      assert.ok(error instanceof DOMException);
      assert.equal(error.name, "AbortError");
      return true;
    });
    // The whole point: cancellation lands in milliseconds, not after the
    // 20-minute per-request timeout.
    assert.ok(performance.now() - startedAt < 5_000);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.MAAS_API_KEY;
    else process.env.MAAS_API_KEY = originalKey;
  }
});

test("the cancel endpoint returns 404 for unknown or already-finished runs", async () => {
  const response = await cancelRoute.POST(new Request("https://room.test"), {
    params: Promise.resolve({ runId: "run-never-started" }),
  });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { ok: false });
});
