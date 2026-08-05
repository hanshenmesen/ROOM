import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ARTIFACT_SCHEMA_VERSIONS } from "../lib/agent-runtime/artifact-envelope.ts";
import { sampleResume } from "../lib/data/sample-resume.ts";
import { InMemoryWorkflowStore } from "../lib/workflow/in-memory-workflow-store.ts";
import { publicWorkflowSnapshot } from "../lib/workflow/public-snapshot.ts";
import {
  defaultRoomWorkflowHandlers,
  RoomWorkflowEngine,
  WorkflowIdempotencyConflictError,
  WorkflowNodeError,
  WorkflowTransitionError,
} from "../lib/workflow/room-workflow.ts";
import type { WorkflowNodeHandlers } from "../lib/workflow/types.ts";

test("the default Workflow checkpoints every deterministic Pipeline node", async () => {
  const store = new InMemoryWorkflowStore();
  await store.clear();
  const engine = new RoomWorkflowEngine(store);
  const result = await engine.start({ type: "text", label: "Fictional résumé", text: sampleResume });
  const state = result.state;
  assert.equal(state.status, "completed");
  assert.deepEqual(state.completedNodes, [
    "prepare_source",
    "extract_profile",
    "direct_world",
    "compile_world",
    "check_world",
    "complete",
  ]);
  assert.equal(state.checkpoints.length, 6);
  assert.equal(state.metrics.nodeExecutions, 6);
  assert.equal(state.artifacts.profile?.schemaVersion, ARTIFACT_SCHEMA_VERSIONS.profile);
  assert.equal(state.artifacts.creativeBrief?.schemaVersion, ARTIFACT_SCHEMA_VERSIONS["creative-brief"]);
  assert.equal(state.artifacts.world?.schemaVersion, ARTIFACT_SCHEMA_VERSIONS.world);
  assert.equal(state.artifacts.checkReport?.schemaVersion, ARTIFACT_SCHEMA_VERSIONS["check-report"]);
  assert.equal(state.artifacts.checkReport?.data.passed, true);
  const events = await engine.getEvents(state.runId);
  assert.deepEqual(events.map((event) => event.sequence), events.map((_, index) => index + 1));
  assert.equal(events.at(-1)?.type, "run.completed");

  const publicSnapshot = publicWorkflowSnapshot(state);
  const serialized = JSON.stringify(publicSnapshot);
  assert.doesNotMatch(serialized, /Echo Atlas|Creative Technologist/);
  assert.match(serialized, /profile\.v1/);
  assert.equal(publicSnapshot.persistence.survivesProcessRestart, false);
});

test("resume restarts at the failed node without rerunning completed nodes", async () => {
  const store = new InMemoryWorkflowStore();
  await store.clear();
  let prepareCalls = 0;
  let extractCalls = 0;
  const handlers: WorkflowNodeHandlers = {
    ...defaultRoomWorkflowHandlers,
    prepare_source: async (context) => {
      prepareCalls += 1;
      return defaultRoomWorkflowHandlers.prepare_source(context);
    },
    extract_profile: async (context) => {
      extractCalls += 1;
      if (context.attempt === 1) throw new WorkflowNodeError("simulated_interrupt", "Simulated interruption.");
      return defaultRoomWorkflowHandlers.extract_profile(context);
    },
  };
  const engine = new RoomWorkflowEngine(store, handlers);
  const started = await engine.start({ type: "text", label: "Resume test", text: sampleResume });
  assert.equal(started.state.status, "failed");
  assert.doesNotMatch(JSON.stringify(publicWorkflowSnapshot(started.state)), /Simulated interruption/);
  assert.deepEqual(started.state.completedNodes, ["prepare_source"]);
  assert.equal(started.state.attempts.prepare_source, 1);
  assert.equal(started.state.attempts.extract_profile, 1);

  const resumed = await engine.resume(started.runId);
  assert.equal(resumed.status, "completed");
  assert.equal(resumed.attempts.prepare_source, 1);
  assert.equal(resumed.attempts.extract_profile, 2);
  assert.equal(resumed.metrics.resumedCount, 1);
  assert.equal(prepareCalls, 1);
  assert.equal(extractCalls, 2);
  const events = await engine.getEvents(started.runId);
  assert.equal(events.filter((event) => event.type === "run.failed").length, 1);
  assert.equal(events.filter((event) => event.type === "run.resumed").length, 1);
});

test("Idempotency Keys deduplicate matching input and reject conflicting input", async () => {
  const store = new InMemoryWorkflowStore();
  await store.clear();
  const engine = new RoomWorkflowEngine(store);
  const input = { type: "text" as const, label: "Idempotent", text: "Avery\nEngineer" };
  const first = await engine.start(input, { idempotencyKey: "resume-upload-0001", autoRun: false });
  const repeated = await engine.start(input, { idempotencyKey: "resume-upload-0001", autoRun: false });
  assert.equal(repeated.reused, true);
  assert.equal(repeated.runId, first.runId);
  assert.equal((await engine.getEvents(first.runId)).filter((event) => event.type === "run.queued").length, 1);
  await assert.rejects(
    engine.start({ ...input, text: "Different source" }, { idempotencyKey: "resume-upload-0001" }),
    WorkflowIdempotencyConflictError,
  );
});

test("cancellation is idempotent and prevents a queued Run from resuming", async () => {
  const store = new InMemoryWorkflowStore();
  await store.clear();
  const engine = new RoomWorkflowEngine(store);
  const started = await engine.start({ type: "text", label: "Cancel", text: "Robin\nEngineer" }, { autoRun: false });
  const cancelled = await engine.cancel(started.runId);
  assert.equal(cancelled.status, "cancelled");
  assert.equal((await engine.cancel(started.runId)).status, "cancelled");
  await assert.rejects(engine.resume(started.runId), WorkflowTransitionError);
  assert.equal((await engine.getEvents(started.runId)).filter((event) => event.type === "run.cancelled").length, 1);
});

test("the D1 migration stores Workflow metadata and references without source or secret bodies", () => {
  const migration = readFileSync(
    new URL("../drizzle/0000_optimal_night_nurse.sql", import.meta.url),
    "utf8",
  );
  for (const table of ["agent_runs", "agent_steps", "agent_events", "agent_artifacts", "eval_runs"]) {
    assert.match(migration, new RegExp("CREATE TABLE `" + table + "`"));
  }
  assert.doesNotMatch(
    migration,
    /source_(?:text|body|content)|resume_(?:text|body|content)|prompt_(?:text|body|content)|api_key|authorization|artifact_json/i,
  );
  assert.match(migration, /`storage_key` text/);
  assert.match(migration, /`report_storage_key` text/);
});
