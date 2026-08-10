import assert from "node:assert/strict";
import test from "node:test";
import { sampleResume } from "../lib/data/sample-resume.ts";
import {
  DurableWorkflowStore,
  InMemoryWorkflowMetadataStore,
  projectRun,
} from "../lib/workflow/durable-workflow-store.ts";
import { InMemoryWorkflowStore } from "../lib/workflow/in-memory-workflow-store.ts";
import { InMemoryObjectStore, R2ObjectStore, type R2BucketLike } from "../lib/workflow/object-store.ts";
import { publicWorkflowSnapshot } from "../lib/workflow/public-snapshot.ts";
import {
  defaultRoomWorkflowHandlers,
  RoomWorkflowEngine,
  WorkflowIdempotencyConflictError,
  WorkflowNodeError,
} from "../lib/workflow/room-workflow.ts";
import type { WorkflowNodeHandlers, WorkflowRecord, WorkflowStore } from "../lib/workflow/types.ts";

function durableBackends() {
  return {
    metadata: new InMemoryWorkflowMetadataStore(),
    objects: new InMemoryObjectStore(),
  };
}

function sampleRecord(runId = "workflow-test-0001"): WorkflowRecord {
  const now = new Date().toISOString();
  return {
    state: {
      schemaVersion: "room-workflow-state.v2",
      runId,
      status: "queued",
      sourceHash: "a".repeat(64),
      source: { type: "text", label: "Fictional résumé", lineCount: 3, byteLength: 42 },
      completedNodes: [],
      attempts: {},
      artifacts: {},
      checkpoints: [],
      metrics: { nodeExecutions: 0, nodeLatencyMs: {}, resumedCount: 0 },
      reviewHistory: [],
      createdAt: now,
      updatedAt: now,
    },
    input: { type: "text", label: "Fictional résumé", text: sampleResume },
    events: [],
    idempotencyKey: "idem-key-0001",
  };
}

test("durable store matches in-memory CRUD and conflict semantics", async () => {
  const reference: WorkflowStore = new InMemoryWorkflowStore();
  const { metadata, objects } = durableBackends();
  const durable: WorkflowStore = new DurableWorkflowStore(metadata, objects);

  assert.equal(await durable.get("workflow-missing-0001"), undefined);
  assert.equal(await reference.get("workflow-missing-0001"), undefined);

  await assert.rejects(() => durable.save(sampleRecord("workflow-missing-0002")), /does not exist/);

  const record = sampleRecord();
  await durable.create(record);
  await reference.create(structuredClone(record));
  await assert.rejects(() => durable.create(record), /already exists/);
  await assert.rejects(() => reference.create(structuredClone(record)), /already exists/);

  const conflictingKey = sampleRecord("workflow-test-0002");
  await assert.rejects(() => durable.create(conflictingKey), /Idempotency key already belongs to/);

  const loaded = await durable.get(record.state.runId);
  assert.deepEqual(loaded, record);

  loaded!.state.status = "completed";
  loaded!.state.updatedAt = new Date().toISOString();
  await durable.save(loaded!);
  assert.equal((await durable.get(record.state.runId))!.state.status, "completed");
});

test("durable runs resume across store instances, simulating a process restart", async () => {
  const { metadata, objects } = durableBackends();
  let attempts = 0;
  const flakyHandlers: WorkflowNodeHandlers = {
    ...defaultRoomWorkflowHandlers,
    extract_profile: async (context) => {
      attempts += 1;
      if (attempts === 1) throw new WorkflowNodeError("simulated_crash", "Simulated process crash.");
      return defaultRoomWorkflowHandlers.extract_profile(context);
    },
  };

  const engineA = new RoomWorkflowEngine(new DurableWorkflowStore(metadata, objects), flakyHandlers);
  const started = await engineA.start({ type: "text", label: "Durable résumé", text: sampleResume });
  assert.equal(started.state.status, "failed");
  assert.deepEqual(started.state.completedNodes, ["prepare_source"]);

  // A brand-new store and engine over the same backends stands in for a fresh
  // process (or Worker isolate) after a deploy or restart.
  const engineB = new RoomWorkflowEngine(new DurableWorkflowStore(metadata, objects), flakyHandlers);
  const recovered = await engineB.getState(started.runId);
  assert.equal(recovered.status, "failed");
  assert.equal(recovered.attempts.extract_profile, 1);

  const resumed = await engineB.resume(started.runId);
  assert.equal(resumed.status, "completed");
  assert.equal(resumed.attempts.prepare_source, 1);
  assert.equal(resumed.attempts.extract_profile, 2);
  assert.equal(resumed.checkpoints.length, 6);
  assert.equal(resumed.metrics.resumedCount, 1);

  const events = await engineB.getEvents(started.runId);
  assert.deepEqual(events.map((event) => event.sequence), events.map((_, index) => index + 1));
  assert.equal(events.at(-1)?.type, "run.completed");
});

test("idempotent restart deduplicates across store instances", async () => {
  const { metadata, objects } = durableBackends();
  const input = { type: "text" as const, label: "Idempotent résumé", text: sampleResume };
  const engineA = new RoomWorkflowEngine(new DurableWorkflowStore(metadata, objects));
  const first = await engineA.start(input, { idempotencyKey: "durable-idem-0001" });
  assert.equal(first.reused, false);

  const engineB = new RoomWorkflowEngine(new DurableWorkflowStore(metadata, objects));
  const second = await engineB.start(input, { idempotencyKey: "durable-idem-0001" });
  assert.equal(second.reused, true);
  assert.equal(second.runId, first.runId);

  await assert.rejects(
    () => engineB.start({ ...input, text: `${sampleResume}\nExtra line.` }, { idempotencyKey: "durable-idem-0001" }),
    WorkflowIdempotencyConflictError,
  );
});

test("durable metadata keeps no source or artifact bodies", async () => {
  const { metadata, objects } = durableBackends();
  const engine = new RoomWorkflowEngine(new DurableWorkflowStore(metadata, objects));
  const started = await engine.start({ type: "text", label: "Privacy résumé", text: sampleResume });
  assert.equal(started.state.status, "completed");

  const metadataSurface = JSON.stringify(metadata.dump());
  assert.doesNotMatch(metadataSurface, /Echo Atlas|Creative Technologist/);
  assert.doesNotMatch(metadataSurface, /resumeText|experience|skillMatrix/i);

  const objectKeys = objects.keys();
  assert.ok(objectKeys.some((key) => key.endsWith("/state.json")));
  assert.ok(objectKeys.some((key) => key.endsWith("/input.json")));
  assert.ok(objectKeys.some((key) => key.endsWith("/events.json")));
});

test("event-sourced projection rebuilds steps, events, and artifacts", async () => {
  const { metadata, objects } = durableBackends();
  const engine = new RoomWorkflowEngine(new DurableWorkflowStore(metadata, objects));
  const started = await engine.start({ type: "text", label: "Projection résumé", text: sampleResume });
  const record = await new DurableWorkflowStore(metadata, objects).get(started.runId);
  assert.ok(record);
  const projection = projectRun(record!);

  assert.equal(projection.steps.length, 6);
  assert.deepEqual(projection.steps.map((step) => step.node), [
    "prepare_source",
    "extract_profile",
    "direct_world",
    "compile_world",
    "check_world",
    "complete",
  ]);
  assert.ok(projection.steps.every((step) => step.status === "completed"));
  assert.ok(projection.steps.every((step) => typeof step.latencyMs === "number"));
  assert.ok(projection.steps.every((step) => step.checkpointId));

  assert.equal(projection.events.length, record!.events.length);
  assert.deepEqual(projection.events.map((event) => event.sequence), record!.events.map((event) => event.sequence));
  assert.ok(projection.events.every((event) => event.payloadJson.length <= 200));

  assert.deepEqual(
    projection.artifacts.map((artifact) => artifact.artifactType).sort(),
    ["check-report", "creative-brief", "profile", "world"].sort(),
  );
  assert.ok(projection.artifacts.every((artifact) => artifact.storageKey?.endsWith("/state.json")));
});

test("store persistence descriptors flow into public snapshots", async () => {
  const { metadata, objects } = durableBackends();
  const durableEngine = new RoomWorkflowEngine(new DurableWorkflowStore(metadata, objects));
  const started = await durableEngine.start({ type: "text", label: "Snapshot résumé", text: sampleResume });
  const durableSnapshot = publicWorkflowSnapshot(started.state, durableEngine.persistence);
  assert.equal(durableSnapshot.persistence.mode, "durable-d1-r2");
  assert.equal(durableSnapshot.persistence.survivesProcessRestart, true);

  const inMemoryEngine = new RoomWorkflowEngine(new InMemoryWorkflowStore());
  const memorySnapshot = publicWorkflowSnapshot(started.state, inMemoryEngine.persistence);
  assert.equal(memorySnapshot.persistence.mode, "in-memory");
  assert.equal(memorySnapshot.persistence.survivesProcessRestart, false);

  // The default snapshot contract stays in-memory for backwards compatibility.
  assert.equal(publicWorkflowSnapshot(started.state).persistence.survivesProcessRestart, false);
});

test("R2 object store namespaces keys and round-trips bodies", async () => {
  const calls: string[] = [];
  const bucketObjects = new Map<string, string>();
  const bucket: R2BucketLike = {
    async put(key, value) { calls.push(`put:${key}`); bucketObjects.set(key, value); },
    async get(key) {
      calls.push(`get:${key}`);
      const value = bucketObjects.get(key);
      return value === undefined ? null : { text: async () => value };
    },
    async delete(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) { calls.push(`delete:${key}`); bucketObjects.delete(key); }
    },
    async list(options) {
      calls.push(`list:${options?.prefix ?? ""}`);
      const objects = [...bucketObjects.keys()].filter((key) => key.startsWith(options?.prefix ?? "")).map((key) => ({ key }));
      return { objects, truncated: false };
    },
  };

  const store = new R2ObjectStore(bucket, "workflow/v1/");
  await store.put("runs/workflow-1/state.json", "{\"ok\":true}");
  assert.equal(await store.get("runs/workflow-1/state.json"), "{\"ok\":true}");
  assert.equal(await store.get("runs/workflow-1/missing.json"), undefined);
  assert.ok(calls.includes("put:workflow/v1/runs/workflow-1/state.json"));

  bucketObjects.set("unrelated/asset.png", "binary");
  await store.clear();
  assert.deepEqual([...bucketObjects.keys()], ["unrelated/asset.png"]);
  assert.ok(calls.includes("list:workflow/v1/"));
});

test("unsupported durable state schema versions fail explicitly", async () => {
  const { metadata, objects } = durableBackends();
  const store = new DurableWorkflowStore(metadata, objects);
  const record = sampleRecord("workflow-test-legacy");
  await store.create(record);
  const legacyKey = objects.keys().find((key) => key.includes("workflow-test-legacy") && key.endsWith("state.json"));
  assert.ok(legacyKey);
  await objects.put(legacyKey!, JSON.stringify({ ...record.state, schemaVersion: "room-workflow-state.v1" }));
  await assert.rejects(() => store.get("workflow-test-legacy"), /Unsupported workflow state schema version/);
});

test("clear removes metadata and durable bodies", async () => {
  const { metadata, objects } = durableBackends();
  const store = new DurableWorkflowStore(metadata, objects);
  const engine = new RoomWorkflowEngine(store);
  const started = await engine.start({ type: "text", label: "Cleanup résumé", text: sampleResume });
  assert.ok(objects.keys().length > 0);

  await store.clear();
  assert.equal(await store.get(started.runId), undefined);
  assert.deepEqual(objects.keys(), []);
  assert.deepEqual(metadata.dump().runs, []);
});
