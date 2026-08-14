import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ARTIFACT_SCHEMA_VERSIONS } from "../lib/agent-runtime/artifact-envelope.ts";
import { parseProfile } from "../lib/agents/parser.ts";
import { sampleResume } from "../lib/data/sample-resume.ts";
import { InMemoryWorkflowStore } from "../lib/workflow/in-memory-workflow-store.ts";
import { publicWorkflowSnapshot } from "../lib/workflow/public-snapshot.ts";
import { mergeProfilesWithReport } from "../lib/profile-merge.ts";
import {
  defaultRoomWorkflowHandlers,
  RoomWorkflowEngine,
  WorkflowIdempotencyConflictError,
  WorkflowNodeError,
  WorkflowTransitionError,
} from "../lib/workflow/room-workflow.ts";
import type { WorkflowNodeHandlers } from "../lib/workflow/types.ts";
import { agentRoomWorkflowHandlers } from "../lib/workflow/agent-workflow-handlers.ts";
import { PROFILE_AGENT_LEASE_TTL_MS } from "../lib/agent-runtime/run-controls.ts";
import { createRoomRunContext } from "../lib/agent-runtime/run-context.ts";

test("the default Workflow checkpoints every deterministic Pipeline node", async () => {
  const store = new InMemoryWorkflowStore();
  await store.clear();
  const engine = new RoomWorkflowEngine(store);
  const result = await engine.start({ type: "text", label: "Fictional résumé", text: sampleResume });
  const state = result.state;
  assert.equal(state.status, "completed");
  assert.deepEqual(state.completedNodes, [
    "prepare_source",
    "extract_identity",
    "extract_inventory",
    "research_website",
    "merge_profile",
    "review_profile",
    "direct_world",
    "compile_world",
    "check_world",
    "complete",
  ]);
  assert.equal(state.checkpoints.length, 10);
  assert.equal(state.metrics.nodeExecutions, 10);
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
    extract_inventory: async (context) => {
      extractCalls += 1;
      if (context.attempt === 1) throw new WorkflowNodeError("simulated_interrupt", "Simulated interruption.");
      return defaultRoomWorkflowHandlers.extract_inventory(context);
    },
  };
  const engine = new RoomWorkflowEngine(store, handlers);
  const started = await engine.start({ type: "text", label: "Resume test", text: sampleResume });
  assert.equal(started.state.status, "failed");
  assert.doesNotMatch(JSON.stringify(publicWorkflowSnapshot(started.state)), /Simulated interruption/);
  assert.deepEqual(started.state.completedNodes, ["prepare_source", "extract_identity"]);
  assert.equal(started.state.attempts.prepare_source, 1);
  assert.equal(started.state.attempts.extract_inventory, 1);

  const resumed = await engine.resume(started.runId);
  assert.equal(resumed.status, "completed");
  assert.equal(resumed.attempts.prepare_source, 1);
  assert.equal(resumed.attempts.extract_inventory, 2);
  assert.equal(resumed.metrics.resumedCount, 1);
  assert.equal(prepareCalls, 1);
  assert.equal(extractCalls, 2);
  const events = await engine.getEvents(started.runId);
  assert.equal(events.filter((event) => event.type === "run.failed").length, 1);
  assert.equal(events.filter((event) => event.type === "run.resumed").length, 1);
});

test("resume reclaims an orphaned running node after its execution lease expires", async () => {
  const store = new InMemoryWorkflowStore();
  await store.clear();
  let prepareCalls = 0;
  const engine = new RoomWorkflowEngine(store, {
    ...defaultRoomWorkflowHandlers,
    prepare_source: (context) => {
      prepareCalls += 1;
      return defaultRoomWorkflowHandlers.prepare_source(context);
    },
  });
  const started = await engine.start({
    type: "text", label: "Orphaned Worker", text: "Robin\nEngineer",
  }, { autoRun: false });
  const orphaned = await store.get(started.runId);
  assert.ok(orphaned);
  orphaned.state.status = "running";
  orphaned.state.currentNode = "prepare_source";
  orphaned.state.attempts.prepare_source = 1;
  orphaned.state.metrics.nodeExecutions = 1;
  orphaned.state.updatedAt = new Date(Date.now() - PROFILE_AGENT_LEASE_TTL_MS - 1_000).toISOString();
  await store.save(orphaned);

  const resumed = await engine.resume(started.runId);
  assert.equal(resumed.status, "completed");
  assert.equal(resumed.attempts.prepare_source, 2);
  assert.equal(resumed.metrics.resumedCount, 1);
  assert.equal(prepareCalls, 1);
});

test("profile conflicts pause at a checkpoint and resume after evidence-backed user review", async () => {
  const store = new InMemoryWorkflowStore();
  await store.clear();
  let extractCalls = 0;
  const handlers: WorkflowNodeHandlers = {
    ...defaultRoomWorkflowHandlers,
    review_profile: ({ input, state }) => {
      extractCalls += 1;
      const primary = parseProfile(input.text, { type: input.type === "url" ? "url" : "text", label: input.label });
      const supplement = structuredClone(primary);
      supplement.source = { ...supplement.source, id: "workflow-website", type: "url", label: "Website evidence" };
      supplement.headline = "Conflicting Agent Role";
      supplement.identityEvidence.headline = [{
        sourceId: supplement.source.id,
        locator: "line:2",
        excerpt: "Conflicting Agent Role",
      }];
      const report = mergeProfilesWithReport(primary, supplement, `${input.label} + Website evidence`);
      assert.ok(state.artifacts.profile);
      return {
        review: { type: "profile_conflict", report },
      };
    },
  };
  const engine = new RoomWorkflowEngine(store, handlers);
  const started = await engine.start({ type: "text", label: "Review fixture", text: sampleResume });
  assert.equal(started.state.status, "waiting_for_review");
  assert.deepEqual(started.state.completedNodes, [
    "prepare_source", "extract_identity", "extract_inventory", "research_website", "merge_profile", "review_profile",
  ]);
  assert.equal(started.state.checkpoints.length, 6);
  assert.equal(started.state.activeReview?.report.conflicts.length, 1);
  assert.equal(started.state.artifacts.mergeReport?.schemaVersion, ARTIFACT_SCHEMA_VERSIONS["profile-merge-report"]);
  assert.equal(
    started.state.checkpoints.at(-1)?.artifactVersions.mergeReport,
    ARTIFACT_SCHEMA_VERSIONS["profile-merge-report"],
  );
  assert.equal(extractCalls, 1);
  await assert.rejects(engine.resume(started.runId), /needs a review decision/);

  const snapshot = publicWorkflowSnapshot(started.state);
  assert.equal(snapshot.review?.conflicts[0]?.supplement?.evidence[0]?.excerpt, "Conflicting Agent Role");
  assert.equal("merged" in (snapshot.review || {}), false, "the public snapshot exposes conflict evidence, not the full Profile artifact");
  const conflictId = started.state.activeReview?.report.conflicts[0]?.conflictId;
  assert.ok(conflictId);
  const reviewed = await engine.review(started.runId, [{
    conflictId,
    action: "edit",
    value: "User Confirmed Agent Engineer",
  }]);
  assert.equal(reviewed.status, "completed");
  assert.equal(reviewed.activeReview, undefined);
  assert.equal(reviewed.reviewHistory.length, 1);
  assert.equal(reviewed.artifacts.profile?.data.headline, "User Confirmed Agent Engineer");
  assert.equal(reviewed.artifacts.profile?.data.identityEvidence.headline?.at(-1)?.origin, "user-confirmed");
  assert.equal(extractCalls, 1, "the reviewed extraction checkpoint is not rerun");
  const events = await engine.getEvents(started.runId);
  assert.equal(events.filter((event) => event.type === "review.requested").length, 1);
  assert.equal(events.filter((event) => event.type === "review.completed").length, 1);
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

test("online Agent Workflow resumes Inventory without rerunning the Identity checkpoint", async () => {
  const originalFetch = globalThis.fetch;
  const source = ["林遥", "交互设计师", "设计可进入的数字空间。", "ROOM 项目"].join("\n");
  const identity = {
    sourcePageCount: null,
    personalWebsite: null,
    identity: {
      name: { value: "林遥", evidenceLines: [1], evidenceExcerpt: "林遥" },
      headline: { value: "交互设计师", evidenceLines: [2], evidenceExcerpt: "交互设计师" },
      location: null,
      summary: { value: "设计可进入的数字空间。", evidenceLines: [3], evidenceExcerpt: "设计可进入的数字空间。" },
    },
    contacts: [], foods: [], hobbies: [], skills: [],
  };
  const inventory = {
    sourcePageCount: null,
    items: [{
      kind: "project", contentFamily: null, title: "ROOM 项目", subtitle: null,
      detail: "ROOM 项目", bullets: [], tags: [], timeRange: null, role: null,
      techStack: [], projectUrl: null, fieldEvidence: {}, sourceUrl: null,
      mediaIndex: null, evidenceLines: [4], evidenceExcerpt: "ROOM 项目",
    }],
  };
  let identityCalls = 0;
  let inventoryCalls = 0;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { output_config: { format: { schema: { properties: Record<string, unknown> } } } };
    if (body.output_config.format.schema.properties.identity) {
      identityCalls += 1;
      return Response.json({ content: [{ type: "text", text: JSON.stringify(identity) }] });
    }
    inventoryCalls += 1;
    return Response.json({ content: [{ type: "text", text: JSON.stringify(inventory) }] });
  }) as typeof fetch;

  const providerConfig = {
    maasApiKey: "workflow-test-key",
    maasBaseUrl: "https://external-maas.example/hackson",
    maasModel: "vertex-claude/claude",
    maasMode: "json-schema" as const,
  };
  const store = new InMemoryWorkflowStore();
  const handlers: WorkflowNodeHandlers = {
    ...agentRoomWorkflowHandlers,
    extract_inventory: (context) => {
      if (context.attempt === 1) throw new WorkflowNodeError("simulated_crash", "simulated inventory interruption");
      return agentRoomWorkflowHandlers.extract_inventory(context);
    },
  };
  const engine = new RoomWorkflowEngine(store, handlers);
  try {
    const started = await engine.start({
      type: "text", label: "Agent résumé", text: source, mode: "agent", followWebsite: false,
    }, {
      execution: {
        context: createRoomRunContext({ providerConfig }),
      },
    });
    assert.equal(started.state.status, "failed");
    assert.deepEqual(started.state.completedNodes, ["prepare_source", "extract_identity"]);
    assert.ok(started.state.artifacts.identityDraft);

    const resumed = await engine.resume(started.runId, {
      context: createRoomRunContext({ providerConfig }),
    });
    assert.equal(resumed.status, "completed", JSON.stringify(resumed.failure));
    assert.equal(identityCalls, 1);
    assert.equal(inventoryCalls, 1);
    assert.equal(resumed.metrics.agentBudgetUsage?.modelCalls, 2);
    assert.equal(resumed.artifacts.inventoryDraft?.schemaVersion, "profile-inventory.v1");
    assert.equal(resumed.artifacts.resumeProfile?.data.name, "林遥");
    assert.equal(resumed.artifacts.profile?.data.items.some((item) => item.title === "ROOM 项目"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
