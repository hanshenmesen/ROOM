import assert from "node:assert/strict";
import test from "node:test";
import { sampleResume } from "../lib/data/sample-resume.ts";
import {
  DurableWorkflowStore,
  InMemoryWorkflowMetadataStore,
  type WorkflowRunMetadataRow,
} from "../lib/workflow/durable-workflow-store.ts";
import { InMemoryObjectStore } from "../lib/workflow/object-store.ts";
import {
  applyWorkflowRetention,
  enforceWorkflowRetention,
  planWorkflowRetention,
  WORKFLOW_RETENTION,
} from "../lib/workflow/retention.ts";
import {
  defaultRoomWorkflowHandlers,
  RoomWorkflowEngine,
  WorkflowNodeError,
  WorkflowTransitionError,
} from "../lib/workflow/room-workflow.ts";
import type { WorkflowNodeHandlers } from "../lib/workflow/types.ts";

function metadataRow(runId: string, status: string, createdAt: Date): WorkflowRunMetadataRow {
  return {
    runId,
    schemaVersion: "room-workflow-state.v2",
    status,
    sourceHash: "b".repeat(64),
    sourceType: "text",
    sourceLabel: "Retention fixture",
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
  };
}

test("retention plan separates source expiry, record expiry, and active runs", () => {
  const now = new Date("2026-08-05T12:00:00.000Z");
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const runs = [
    metadataRow("run-recent-complete", "completed", hoursAgo(2)),
    metadataRow("run-old-complete", "completed", hoursAgo(25)),
    metadataRow("run-old-failed", "failed", hoursAgo(30)),
    metadataRow("run-ancient-complete", "completed", daysAgo(31)),
    metadataRow("run-ancient-cancelled", "cancelled", daysAgo(40)),
    metadataRow("run-active-running", "running", daysAgo(35)),
    metadataRow("run-active-review", "waiting_for_review", daysAgo(35)),
    metadataRow("run-queued", "queued", hoursAgo(1)),
  ];

  const plan = planWorkflowRetention(runs, now);
  assert.deepEqual(plan.expiredSourceRunIds.sort(), ["run-old-complete", "run-old-failed"]);
  assert.deepEqual(plan.expiredRunIds.sort(), ["run-ancient-cancelled", "run-ancient-complete"]);
  assert.deepEqual(plan.skippedActiveRunIds.sort(), ["run-active-review", "run-active-running"]);

  // Exactly at each window boundary nothing crosses that window
  // (strictly-greater comparison). A run exactly 30 days old has not crossed
  // the record window, but it is still past the 24-hour source window.
  const boundary = planWorkflowRetention([
    metadataRow("run-boundary-source", "completed", new Date(now.getTime() - WORKFLOW_RETENTION.sourceBodyMs)),
    metadataRow("run-boundary-record", "completed", new Date(now.getTime() - WORKFLOW_RETENTION.runRecordMs)),
  ], now);
  assert.deepEqual(boundary.expiredSourceRunIds, ["run-boundary-record"]);
  assert.deepEqual(boundary.expiredRunIds, []);
});

test("retention deletes source bodies while keeping runs inspectable, then removes full records", async () => {
  const metadata = new InMemoryWorkflowMetadataStore();
  const objects = new InMemoryObjectStore();
  const store = new DurableWorkflowStore(metadata, objects);
  const engine = new RoomWorkflowEngine(store);
  const started = await engine.start({ type: "text", label: "Retention résumé", text: sampleResume });
  assert.equal(started.state.status, "completed");

  // Age the run past the 24-hour source window.
  const row = (await metadata.getRun(started.runId))!;
  row.createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  await metadata.updateRun(row);

  const first = await enforceWorkflowRetention(store, new Date());
  assert.equal(first.deletedSourceBodies, 1);
  assert.equal(first.deletedRuns, 0);
  assert.ok(!objects.keys().some((key) => key.endsWith("/input.json")));

  // The run remains inspectable via a tombstone input.
  const record = await store.get(started.runId);
  assert.ok(record);
  assert.equal(record!.input.text, "");
  assert.match(record!.input.label, /保留策略清理/);
  assert.equal(record!.state.status, "completed");
  assert.ok(record!.events.length > 0);

  // Age past the 30-day record window: everything disappears.
  const olderRow = (await metadata.getRun(started.runId))!;
  olderRow.createdAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  await metadata.updateRun(olderRow);
  const second = await enforceWorkflowRetention(store, new Date());
  assert.equal(second.deletedRuns, 1);
  assert.equal(await store.get(started.runId), undefined);
  assert.deepEqual(objects.keys(), []);
  assert.deepEqual(metadata.dump().runs, []);
});

test("failed runs past the source window cannot resume after retention cleanup", async () => {
  const metadata = new InMemoryWorkflowMetadataStore();
  const objects = new InMemoryObjectStore();
  const store = new DurableWorkflowStore(metadata, objects);
  const handlers: WorkflowNodeHandlers = {
    ...defaultRoomWorkflowHandlers,
    extract_profile: async () => {
      throw new WorkflowNodeError("simulated_failure", "Simulated extraction failure.");
    },
  };
  const engine = new RoomWorkflowEngine(store, handlers);
  const started = await engine.start({ type: "text", label: "Failed résumé", text: sampleResume });
  assert.equal(started.state.status, "failed");

  const row = (await metadata.getRun(started.runId))!;
  row.createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  await metadata.updateRun(row);
  await enforceWorkflowRetention(store, new Date());

  await assert.rejects(
    () => engine.resume(started.runId),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowTransitionError);
      assert.match((error as Error).message, /retention policy/);
      return true;
    },
  );
});

test("retention never touches active runs even past the record window", async () => {
  const metadata = new InMemoryWorkflowMetadataStore();
  const objects = new InMemoryObjectStore();
  const store = new DurableWorkflowStore(metadata, objects);
  const engine = new RoomWorkflowEngine(store);
  const started = await engine.start({ type: "text", label: "Queued résumé", text: sampleResume }, { autoRun: false });
  assert.equal(started.state.status, "queued");

  const row = (await metadata.getRun(started.runId))!;
  row.createdAt = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  await metadata.updateRun(row);

  const plan = planWorkflowRetention(await store.listRuns(), new Date());
  assert.deepEqual(plan.expiredRunIds, []);
  assert.deepEqual(plan.expiredSourceRunIds, []);
  assert.deepEqual(plan.skippedActiveRunIds, [started.runId]);

  const result = await applyWorkflowRetention(store, plan);
  assert.equal(result.deletedRuns, 0);
  assert.equal(result.skippedActiveRuns, 1);
  const record = await store.get(started.runId);
  assert.equal(record!.input.text, sampleResume);
});
