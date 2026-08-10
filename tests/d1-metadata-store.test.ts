import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sampleResume } from "../lib/data/sample-resume.ts";
import { DurableWorkflowStore } from "../lib/workflow/durable-workflow-store.ts";
import { InMemoryObjectStore } from "../lib/workflow/object-store.ts";
import { defaultRoomWorkflowHandlers, RoomWorkflowEngine } from "../lib/workflow/room-workflow.ts";

// node:sqlite is available without a flag on Node 23.4+. On older runtimes
// (e.g. the Node 22 floor in CI) the whole suite skips instead of failing.
let sqliteModule: typeof import("node:sqlite") | null = null;
let createD1WorkflowMetadataStoreFn: typeof import("../lib/workflow/d1-metadata-store.ts").createD1WorkflowMetadataStore | null = null;
let adapterModule: typeof import("../lib/workflow/node-sqlite-d1.ts") | null = null;
try {
  sqliteModule = await import("node:sqlite");
  // Probe: construction throws where the feature is flag-gated.
  new sqliteModule.DatabaseSync(":memory:").close();
  createD1WorkflowMetadataStoreFn = (await import("../lib/workflow/d1-metadata-store.ts")).createD1WorkflowMetadataStore;
  adapterModule = await import("../lib/workflow/node-sqlite-d1.ts");
} catch {
  sqliteModule = null;
}

const skipOptions = sqliteModule ? {} : { skip: "node:sqlite is unavailable on this runtime" };

const MIGRATION_SQL = readFileSync(new URL("../drizzle/0000_optimal_night_nurse.sql", import.meta.url), "utf8");

function createStore() {
  const d1 = adapterModule!.createMigratedNodeSqliteD1(MIGRATION_SQL);
  return createD1WorkflowMetadataStoreFn!(d1);
}

function metadataRow(runId: string, overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    runId,
    schemaVersion: "room-workflow-state.v2",
    status: "queued",
    sourceHash: "c".repeat(64),
    sourceType: "text",
    sourceLabel: "D1 fixture",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("D1 metadata store round-trips run rows through the real migration", { ...skipOptions }, async () => {
  const store = createStore();
  assert.equal(await store.getRun("workflow-d1-missing"), undefined);

  const row = metadataRow("workflow-d1-0001", { idempotencyKey: "d1-idem-0001", currentNode: "extract_profile" });
  await store.insertRun(row);
  const loaded = await store.getRun("workflow-d1-0001");
  assert.deepEqual(loaded, row);
  assert.equal(await store.findRunIdByIdempotencyKey("d1-idem-0001"), "workflow-d1-0001");
  assert.equal(await store.findRunIdByIdempotencyKey("d1-idem-missing"), undefined);

  const updated = { ...row, status: "completed", completedAt: new Date().toISOString() };
  await store.updateRun(updated);
  assert.equal((await store.getRun("workflow-d1-0001"))!.status, "completed");
  await assert.rejects(() => store.updateRun(metadataRow("workflow-d1-missing")), /does not exist/);

  assert.deepEqual(await store.listRunIds(), ["workflow-d1-0001"]);
  assert.deepEqual((await store.listRuns()).map((entry) => entry.runId), ["workflow-d1-0001"]);
});

test("D1 metadata store maps unique violations to shared conflict messages", { ...skipOptions }, async () => {
  const store = createStore();
  await store.insertRun(metadataRow("workflow-d1-0002", { idempotencyKey: "d1-idem-0002" }));

  await assert.rejects(
    () => store.insertRun(metadataRow("workflow-d1-0002")),
    /Workflow run already exists: workflow-d1-0002\./,
  );
  await assert.rejects(
    () => store.insertRun(metadataRow("workflow-d1-0003", { idempotencyKey: "d1-idem-0002" })),
    /Idempotency key already belongs to workflow-d1-0002\./,
  );

  // Runs without an idempotency key coexist (SQLite UNIQUE allows multiple NULLs).
  await store.insertRun(metadataRow("workflow-d1-0004"));
  await store.insertRun(metadataRow("workflow-d1-0005"));
  assert.equal((await store.listRunIds()).length, 3);
});

test("D1 metadata store persists event-sourced projections and deletes cascades", { ...skipOptions }, async () => {
  const db = new sqliteModule!.DatabaseSync(":memory:");
  for (const statement of MIGRATION_SQL.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
    db.exec(statement);
  }
  const store = createD1WorkflowMetadataStoreFn!(adapterModule!.createNodeSqliteD1(db));
  const countRows = (table: string) => (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;

  await store.insertRun(metadataRow("workflow-d1-0006", { status: "completed" }));
  const now = new Date().toISOString();
  await store.replaceProjection("workflow-d1-0006", {
    steps: [{
      stepId: "workflow-d1-0006:prepare_source:1",
      runId: "workflow-d1-0006",
      node: "prepare_source",
      status: "completed",
      attempt: 1,
      checkpointId: "checkpoint-1",
      latencyMs: 12,
      startedAt: now,
      completedAt: now,
    }],
    events: [{
      eventId: "event-1",
      runId: "workflow-d1-0006",
      sequence: 1,
      type: "run.queued",
      payloadJson: "{}",
      occurredAt: now,
    }],
    artifacts: [{
      artifactId: "workflow-d1-0006:extract_profile:profile",
      runId: "workflow-d1-0006",
      node: "extract_profile",
      artifactType: "profile",
      schemaVersion: "profile.v1",
      storageKey: "workflow/v1/runs/workflow-d1-0006/state.json",
      byteLength: 4096,
      createdAt: now,
    }],
  });

  assert.equal(countRows("agent_steps"), 1);
  assert.equal(countRows("agent_events"), 1);
  assert.equal(countRows("agent_artifacts"), 1);
  const stepRow = db.prepare("SELECT node, status, latency_ms, checkpoint_id FROM agent_steps WHERE run_id = ?").get("workflow-d1-0006") as Record<string, unknown>;
  assert.equal(stepRow.node, "prepare_source");
  assert.equal(stepRow.status, "completed");
  assert.equal(stepRow.latency_ms, 12);
  assert.equal(stepRow.checkpoint_id, "checkpoint-1");
  const artifactRow = db.prepare("SELECT artifact_type, schema_version, storage_key FROM agent_artifacts WHERE run_id = ?").get("workflow-d1-0006") as Record<string, unknown>;
  assert.equal(artifactRow.artifact_type, "profile");
  assert.equal(artifactRow.schema_version, "profile.v1");
  assert.match(String(artifactRow.storage_key), /state\.json$/);

  // Projections are rebuilt on every save: replacement must not duplicate rows.
  await store.replaceProjection("workflow-d1-0006", {
    steps: [{
      stepId: "workflow-d1-0006:prepare_source:1",
      runId: "workflow-d1-0006",
      node: "prepare_source",
      status: "completed",
      attempt: 1,
      checkpointId: "checkpoint-2",
      latencyMs: 14,
      startedAt: now,
      completedAt: now,
    }],
    events: [],
    artifacts: [],
  });
  assert.equal(countRows("agent_steps"), 1);
  assert.equal(countRows("agent_events"), 0);
  assert.equal(countRows("agent_artifacts"), 0);
  const replaced = db.prepare("SELECT checkpoint_id FROM agent_steps WHERE run_id = ?").get("workflow-d1-0006") as Record<string, unknown>;
  assert.equal(replaced.checkpoint_id, "checkpoint-2");

  await store.deleteRun("workflow-d1-0006");
  assert.equal(await store.getRun("workflow-d1-0006"), undefined);
  assert.deepEqual(await store.listRunIds(), []);
  assert.equal(countRows("agent_steps"), 0);
  db.close();
});

test("D1-backed durable store resumes across instances and keeps bodies out of D1", { ...skipOptions }, async () => {
  const db = new sqliteModule!.DatabaseSync(":memory:");
  for (const statement of MIGRATION_SQL.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
    db.exec(statement);
  }
  const d1 = adapterModule!.createNodeSqliteD1(db);
  const objects = new InMemoryObjectStore();
  let attempts = 0;
  const handlers = {
    ...defaultRoomWorkflowHandlers,
    extract_profile: async (context: Parameters<typeof defaultRoomWorkflowHandlers.extract_profile>[0]) => {
      attempts += 1;
      if (attempts === 1) throw new (await import("../lib/workflow/room-workflow.ts")).WorkflowNodeError("simulated_crash", "Simulated crash.");
      return defaultRoomWorkflowHandlers.extract_profile(context);
    },
  };

  const engineA = new RoomWorkflowEngine(
    new DurableWorkflowStore(createD1WorkflowMetadataStoreFn!(d1), objects),
    handlers,
  );
  const started = await engineA.start({ type: "text", label: "D1 résumé", text: sampleResume });
  assert.equal(started.state.status, "failed");

  const engineB = new RoomWorkflowEngine(
    new DurableWorkflowStore(createD1WorkflowMetadataStoreFn!(d1), objects),
    handlers,
  );
  const resumed = await engineB.resume(started.runId);
  assert.equal(resumed.status, "completed");
  assert.equal(resumed.checkpoints.length, 6);

  // Every D1 table is metadata-only: no résumé content anywhere in the tables.
  const dump = [
    ...db.prepare("SELECT * FROM agent_runs").all(),
    ...db.prepare("SELECT * FROM agent_steps").all(),
    ...db.prepare("SELECT * FROM agent_events").all(),
    ...db.prepare("SELECT * FROM agent_artifacts").all(),
  ];
  assert.ok(dump.length > 0);
  const serialized = JSON.stringify(dump);
  assert.doesNotMatch(serialized, /Echo Atlas|Creative Technologist/);
  assert.doesNotMatch(serialized, new RegExp(sampleResume.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  db.close();
});
