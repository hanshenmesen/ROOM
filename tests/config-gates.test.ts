import assert from "node:assert/strict";
import test from "node:test";
import {
  assertProviderConfigUsable,
  ProviderConfigError,
  resolveProviderConfig,
} from "../lib/agents/provider-config.ts";
import { resolveWorkflowStore } from "../lib/workflow/resolve-store.ts";
import { InMemoryWorkflowStore, inMemoryWorkflowStore } from "../lib/workflow/in-memory-workflow-store.ts";
import { resolveTraceStore } from "../lib/agent-runtime/resolve-trace-store.ts";
import { inMemoryTraceStore } from "../lib/agent-runtime/in-memory-trace-store.ts";
import { createRoomRunContext } from "../lib/agent-runtime/run-context.ts";
import { RoomWorkflowEngine } from "../lib/workflow/room-workflow.ts";
import { agentRoomWorkflowHandlers } from "../lib/workflow/agent-workflow-handlers.ts";
import { projectStepsFromEvents } from "../lib/workflow/durable-workflow-store.ts";
import { projectMetricsFromEvents } from "../lib/workflow/metrics-projection.ts";
import type { WorkflowEvent } from "../lib/workflow/types.ts";
import { migrateArtifact, UnsupportedArtifactVersionError } from "../lib/agent-runtime/artifact-envelope.ts";

// -- P2-3: configuration negative gates --------------------------------

test("assertProviderConfigUsable rejects a config with no usable API key anywhere", () => {
  const originalMaas = process.env.MAAS_API_KEY;
  const originalMaasFallback = process.env.MAAS_API_KEY_FALLBACK;
  const originalWebsite = process.env.WEBSITE_AGENT_API_KEY;
  const originalWebsiteFallback = process.env.WEBSITE_AGENT_API_KEY_FALLBACK;
  const originalPetQa = process.env.PET_QA_API_KEY;
  const originalPetQaFallback = process.env.PET_QA_API_KEY_FALLBACK;
  delete process.env.MAAS_API_KEY;
  delete process.env.MAAS_API_KEY_FALLBACK;
  delete process.env.WEBSITE_AGENT_API_KEY;
  delete process.env.WEBSITE_AGENT_API_KEY_FALLBACK;
  delete process.env.PET_QA_API_KEY;
  delete process.env.PET_QA_API_KEY_FALLBACK;
  try {
    assert.throws(
      () => assertProviderConfigUsable(resolveProviderConfig(undefined)),
      ProviderConfigError,
    );
  } finally {
    if (originalMaas !== undefined) process.env.MAAS_API_KEY = originalMaas;
    if (originalMaasFallback !== undefined) process.env.MAAS_API_KEY_FALLBACK = originalMaasFallback;
    if (originalWebsite !== undefined) process.env.WEBSITE_AGENT_API_KEY = originalWebsite;
    if (originalWebsiteFallback !== undefined) process.env.WEBSITE_AGENT_API_KEY_FALLBACK = originalWebsiteFallback;
    if (originalPetQa !== undefined) process.env.PET_QA_API_KEY = originalPetQa;
    if (originalPetQaFallback !== undefined) process.env.PET_QA_API_KEY_FALLBACK = originalPetQaFallback;
  }
});

test("assertProviderConfigUsable rejects a configured slot with an unparsable baseUrl", () => {
  const config = resolveProviderConfig({ maasApiKey: "test-key", maasBaseUrl: "not a url" });
  assert.throws(() => assertProviderConfigUsable(config), (error) => (
    error instanceof ProviderConfigError && error.slot === "maas"
  ));
});

test("assertProviderConfigUsable accepts a normally-configured slot", () => {
  const config = resolveProviderConfig({ maasApiKey: "test-key", maasBaseUrl: "https://api.deepseek.com" });
  assert.doesNotThrow(() => assertProviderConfigUsable(config));
});

test("resolveWorkflowStore falls back to the in-memory store outside the Worker runtime", async () => {
  const store = await resolveWorkflowStore();
  assert.equal(store, inMemoryWorkflowStore);
  assert.deepEqual(store.persistence, { mode: "in-memory", survivesProcessRestart: false });
});

test("resolveTraceStore falls back to the shared in-memory trace store outside the Worker runtime", async () => {
  const store = await resolveTraceStore();
  assert.equal(store, inMemoryTraceStore);
});

test("a capability mismatch (image input on a provider without image support) fails the Run with an explicit code, not a generic 500", async () => {
  const store = new InMemoryWorkflowStore();
  await store.clear();
  const engine = new RoomWorkflowEngine(store, agentRoomWorkflowHandlers);
  const started = await engine.start({
    type: "image",
    label: "photo.png",
    text: "",
    attachment: { mediaType: "image/png", data: "iVBORw0KGgo=" },
    mode: "agent",
  }, {
    execution: {
      // DeepSeek's official endpoint is capability-matrixed as
      // `supportsImageBlocks: false` (see provider-capabilities.ts); this
      // forces that provider regardless of env/test ordering.
      context: createRoomRunContext({ providerConfig: { maasApiKey: "test-key", maasBaseUrl: "https://api.deepseek.com" } }),
    },
  });
  assert.equal(started.state.status, "failed");
  assert.equal(started.state.failure?.code, "image_unsupported");
});

// -- P2-4: Store/Event determinism hardening ----------------------------

function workflowEvent(overrides: Partial<WorkflowEvent> & Pick<WorkflowEvent, "type">, sequence: number): WorkflowEvent {
  return {
    eventId: `workflow-event-${sequence}`,
    runId: "workflow-determinism-fixture",
    sequence,
    occurredAt: new Date(2026, 0, 1, 0, 0, sequence).toISOString(),
    ...overrides,
  } as WorkflowEvent;
}

test("projectStepsFromEvents and projectMetricsFromEvents are pure: replaying the same event log twice yields identical results", () => {
  const events: WorkflowEvent[] = [
    workflowEvent({ type: "run.started" }, 1),
    workflowEvent({ type: "node.started", node: "prepare_source", attempt: 1 }, 2),
    workflowEvent({ type: "checkpoint.saved", node: "prepare_source", checkpointId: "checkpoint-1" }, 3),
    workflowEvent({ type: "node.completed", node: "prepare_source", latencyMs: 12.5 }, 4),
    workflowEvent({ type: "run.resumed", fromNode: "extract_identity" }, 5),
    workflowEvent({ type: "node.started", node: "extract_identity", attempt: 1 }, 6),
    workflowEvent({ type: "run.failed", node: "extract_identity", errorCode: "node_failed" }, 7),
  ];
  const recordFor = (eventList: WorkflowEvent[]) => ({
    state: { runId: "workflow-determinism-fixture" },
    events: eventList,
  }) as unknown as import("../lib/workflow/types.ts").WorkflowRecord;

  const stepsFirst = projectStepsFromEvents(recordFor(events));
  const stepsSecond = projectStepsFromEvents(recordFor([...events]));
  assert.deepEqual(stepsFirst, stepsSecond);
  assert.equal(stepsFirst.length, 2);
  assert.equal(stepsFirst[0].status, "completed");
  assert.equal(stepsFirst[1].status, "failed");

  const metricsFirst = projectMetricsFromEvents(events);
  const metricsSecond = projectMetricsFromEvents([...events]);
  assert.deepEqual(metricsFirst, metricsSecond);
  assert.equal(metricsFirst.nodeExecutions, 2);
  assert.equal(metricsFirst.resumedCount, 1);
  assert.equal(metricsFirst.nodeLatencyMs.prepare_source, 12.5);
});

test("migrateArtifact still rejects an unknown version when no codec is registered (no accidental global registry leakage across tests)", () => {
  assert.throws(
    () => migrateArtifact("check-report", {
      artifactType: "check-report",
      schemaVersion: "check-report.v0",
      data: {},
    }),
    UnsupportedArtifactVersionError,
  );
});
