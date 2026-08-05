import { wrapArtifact } from "../agent-runtime/artifact-envelope.ts";
import { checkWorld } from "../agents/checker.ts";
import { directWorld } from "../agents/creative-director.ts";
import { orchestrateWorld } from "../agents/orchestrator.ts";
import { parseProfile } from "../agents/parser.ts";
import { normalizeDisplayProfile } from "../display-copy.ts";
import { resolveProfileMergeReview } from "../profile-merge.ts";
import { inMemoryWorkflowStore } from "./in-memory-workflow-store.ts";
import {
  ROOM_WORKFLOW_NODES,
  ROOM_WORKFLOW_SCHEMA_VERSION,
  type RoomWorkflowArtifacts,
  type RoomWorkflowState,
  type WorkflowEvent,
  type WorkflowNodeHandlers,
  type WorkflowNodeOutput,
  type WorkflowRecord,
  type WorkflowReviewSubmission,
  type WorkflowSourceInput,
  type WorkflowStore,
} from "./types.ts";

type WorkflowEventDraft = WorkflowEvent extends infer Event
  ? Event extends WorkflowEvent
    ? Omit<Event, "eventId" | "runId" | "sequence" | "occurredAt">
    : never
  : never;

export class WorkflowNotFoundError extends Error {
  constructor(runId: string) {
    super(`Workflow run not found: ${runId}.`);
    this.name = "WorkflowNotFoundError";
  }
}

export class WorkflowIdempotencyConflictError extends Error {
  constructor() {
    super("The Idempotency Key is already associated with different source input.");
    this.name = "WorkflowIdempotencyConflictError";
  }
}

export class WorkflowTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowTransitionError";
  }
}

export class WorkflowNodeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WorkflowNodeError";
    this.code = code;
  }
}

function uniqueId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function appendEvent(record: WorkflowRecord, draft: WorkflowEventDraft) {
  const event = {
    ...draft,
    eventId: uniqueId("workflow-event"),
    runId: record.state.runId,
    sequence: record.events.length + 1,
    occurredAt: new Date().toISOString(),
  } as WorkflowEvent;
  record.events.push(event);
  record.state.updatedAt = event.occurredAt;
  return event;
}

function nextNode(state: RoomWorkflowState) {
  return ROOM_WORKFLOW_NODES.find((node) => !state.completedNodes.includes(node));
}

function artifactVersions(artifacts: RoomWorkflowArtifacts) {
  return Object.fromEntries(Object.entries(artifacts).map(([key, envelope]) => [
    key,
    envelope?.schemaVersion,
  ]).filter((entry) => entry[1])) as Partial<Record<keyof RoomWorkflowArtifacts, string>>;
}

function normalizeNodeOutput(
  output: Partial<RoomWorkflowArtifacts> | WorkflowNodeOutput | void,
): WorkflowNodeOutput {
  if (!output) return {};
  if ("artifacts" in output || "review" in output) return output as WorkflowNodeOutput;
  return { artifacts: output as Partial<RoomWorkflowArtifacts> };
}

function requireArtifact<K extends keyof RoomWorkflowArtifacts>(
  state: Readonly<RoomWorkflowState>,
  key: K,
): NonNullable<RoomWorkflowArtifacts[K]> {
  const artifact = state.artifacts[key];
  if (!artifact) throw new WorkflowNodeError("missing_dependency", `Workflow artifact is missing: ${key}.`);
  return artifact as NonNullable<RoomWorkflowArtifacts[K]>;
}

export const defaultRoomWorkflowHandlers: WorkflowNodeHandlers = {
  prepare_source: () => undefined,
  extract_profile: ({ input }) => ({
    profile: wrapArtifact("profile", normalizeDisplayProfile(parseProfile(input.text, {
      type: input.type,
      label: input.label,
    }))),
  }),
  direct_world: ({ state }) => ({
    creativeBrief: wrapArtifact("creative-brief", directWorld(requireArtifact(state, "profile").data)),
  }),
  compile_world: ({ state }) => ({
    world: wrapArtifact("world", orchestrateWorld(
      requireArtifact(state, "profile").data,
      requireArtifact(state, "creativeBrief").data,
    )),
  }),
  check_world: ({ state }) => ({
    checkReport: wrapArtifact("check-report", checkWorld(requireArtifact(state, "world").data)),
  }),
  complete: ({ state }) => {
    const report = requireArtifact(state, "checkReport").data;
    if (!report.passed) throw new WorkflowNodeError("world_check_failed", "World Check Report did not pass.");
  },
};

export type StartWorkflowOptions = {
  idempotencyKey?: string;
  autoRun?: boolean;
};

export type StartWorkflowResult = {
  runId: string;
  reused: boolean;
  state: RoomWorkflowState;
};

export class RoomWorkflowEngine {
  private readonly store: WorkflowStore;
  private readonly handlers: WorkflowNodeHandlers;

  constructor(
    store: WorkflowStore = inMemoryWorkflowStore,
    handlers: WorkflowNodeHandlers = defaultRoomWorkflowHandlers,
  ) {
    this.store = store;
    this.handlers = handlers;
  }

  async start(input: WorkflowSourceInput, options: StartWorkflowOptions = {}): Promise<StartWorkflowResult> {
    const sourceHash = await sha256(`${input.type}\n${input.label}\n${input.text}`);
    const idempotencyKey = options.idempotencyKey?.trim();
    if (idempotencyKey) {
      const existingRunId = await this.store.findRunIdByIdempotencyKey(idempotencyKey);
      if (existingRunId) {
        const existing = await this.requireRecord(existingRunId);
        if (existing.state.sourceHash !== sourceHash) throw new WorkflowIdempotencyConflictError();
        return { runId: existingRunId, reused: true, state: existing.state };
      }
    }

    const now = new Date().toISOString();
    const runId = uniqueId("workflow");
    const state: RoomWorkflowState = {
      schemaVersion: ROOM_WORKFLOW_SCHEMA_VERSION,
      runId,
      status: "queued",
      sourceHash,
      source: {
        type: input.type,
        label: input.label,
        lineCount: input.text ? input.text.split(/\r?\n/).length : 0,
        byteLength: new TextEncoder().encode(input.text).byteLength,
      },
      completedNodes: [],
      attempts: {},
      artifacts: {},
      checkpoints: [],
      metrics: { nodeExecutions: 0, nodeLatencyMs: {}, resumedCount: 0 },
      reviewHistory: [],
      createdAt: now,
      updatedAt: now,
    };
    const record: WorkflowRecord = { state, input: structuredClone(input), events: [], idempotencyKey };
    appendEvent(record, { type: "run.queued" });
    await this.store.create(record);
    if (options.autoRun !== false) await this.execute(runId, false);
    return { runId, reused: false, state: await this.getState(runId) };
  }

  async resume(runId: string) {
    const record = await this.requireRecord(runId);
    if (record.state.status === "completed") throw new WorkflowTransitionError("Completed Workflow Runs cannot be resumed.");
    if (record.state.status === "cancelled") throw new WorkflowTransitionError("Cancelled Workflow Runs cannot be resumed.");
    if (record.state.status === "running") return record.state;
    if (record.state.status === "waiting_for_review") {
      throw new WorkflowTransitionError("This Workflow Run needs a review decision before it can resume.");
    }
    await this.execute(runId, true);
    return this.getState(runId);
  }

  async cancel(runId: string) {
    const record = await this.requireRecord(runId);
    if (record.state.status === "cancelled") return record.state;
    if (record.state.status === "completed") throw new WorkflowTransitionError("Completed Workflow Runs cannot be cancelled.");
    record.state.status = "cancelled";
    record.state.completedAt = new Date().toISOString();
    appendEvent(record, { type: "run.cancelled", atNode: record.state.currentNode });
    await this.store.save(record);
    return record.state;
  }

  async getState(runId: string) {
    return (await this.requireRecord(runId)).state;
  }

  async getEvents(runId: string, afterSequence = 0) {
    const record = await this.requireRecord(runId);
    return record.events.filter((event) => event.sequence > afterSequence);
  }

  async review(runId: string, resolutions: WorkflowReviewSubmission) {
    let record = await this.requireRecord(runId);
    if (record.state.status !== "waiting_for_review" || !record.state.activeReview) {
      throw new WorkflowTransitionError("This Workflow Run is not waiting for review.");
    }
    const activeReview = record.state.activeReview;
    const reviewed = resolveProfileMergeReview(activeReview.report, resolutions);
    record.state.artifacts.profile = wrapArtifact("profile", reviewed.profile);
    const resolvedAt = new Date().toISOString();
    record.state.reviewHistory.push({
      type: activeReview.type,
      node: activeReview.node,
      resolvedAt,
      userClaims: reviewed.userClaims,
    });
    record.state.activeReview = undefined;
    record.state.status = "queued";
    record.state.currentNode = undefined;
    appendEvent(record, {
      type: "review.completed",
      node: activeReview.node,
      resolutionCount: reviewed.userClaims.length,
    });
    await this.store.save(record);
    await this.execute(runId, true);
    record = await this.requireRecord(runId);
    return record.state;
  }

  private async requireRecord(runId: string) {
    const record = await this.store.get(runId);
    if (!record) throw new WorkflowNotFoundError(runId);
    return record;
  }

  private async execute(runId: string, resumed: boolean) {
    let record = await this.requireRecord(runId);
    if (record.state.status === "cancelled" || record.state.status === "completed") return;
    record.state.status = "running";
    record.state.failure = undefined;
    if (resumed) {
      record.state.metrics.resumedCount += 1;
      appendEvent(record, { type: "run.resumed", fromNode: nextNode(record.state) });
    } else {
      appendEvent(record, { type: "run.started" });
    }
    await this.store.save(record);

    while (true) {
      record = await this.requireRecord(runId);
      if (record.state.status === "cancelled") return;
      const node = nextNode(record.state);
      if (!node) return;
      record.state.currentNode = node;
      const attempt = (record.state.attempts[node] || 0) + 1;
      record.state.attempts[node] = attempt;
      record.state.metrics.nodeExecutions += 1;
      appendEvent(record, { type: "node.started", node, attempt });
      await this.store.save(record);
      const started = performance.now();
      try {
        const rawOutput = await this.handlers[node]({
          runId,
          node,
          attempt,
          input: structuredClone(record.input),
          state: structuredClone(record.state),
        });
        const latest = await this.requireRecord(runId);
        if (latest.state.status === "cancelled") return;
        record = latest;
        const output = normalizeNodeOutput(rawOutput);
        if (output.artifacts) record.state.artifacts = { ...record.state.artifacts, ...output.artifacts };
        if (output.review) {
          if (!output.review.report.reviewRequired || !output.review.report.conflicts.some((conflict) => conflict.required)) {
            throw new WorkflowNodeError("invalid_review_request", "Workflow Review Request has no required conflicts.");
          }
          record.state.artifacts.mergeReport = wrapArtifact("profile-merge-report", output.review.report);
        }
        const latencyMs = Math.max(0, Math.round((performance.now() - started) * 100) / 100);
        record.state.metrics.nodeLatencyMs[node] = latencyMs;
        if (!record.state.completedNodes.includes(node)) record.state.completedNodes.push(node);
        const checkpointId = uniqueId("checkpoint");
        record.state.checkpoints.push({
          checkpointId,
          completedNode: node,
          nextNode: nextNode(record.state),
          createdAt: new Date().toISOString(),
          artifactVersions: artifactVersions(record.state.artifacts),
        });
        appendEvent(record, { type: "checkpoint.saved", node, checkpointId });
        appendEvent(record, { type: "node.completed", node, latencyMs });
        if (output.review) {
          record.state.activeReview = {
            ...output.review,
            node,
            requestedAt: new Date().toISOString(),
          };
          record.state.status = "waiting_for_review";
          record.state.currentNode = undefined;
          appendEvent(record, {
            type: "review.requested",
            node,
            conflictCount: output.review.report.conflicts.filter((conflict) => conflict.required).length,
          });
        }
        if (node === "complete") {
          record.state.status = "completed";
          record.state.currentNode = undefined;
          record.state.completedAt = new Date().toISOString();
          appendEvent(record, { type: "run.completed" });
        }
        await this.store.save(record);
        if (node === "complete" || output.review) return;
      } catch (error) {
        record = await this.requireRecord(runId);
        if (record.state.status === "cancelled") return;
        const code = error instanceof WorkflowNodeError ? error.code : "node_failed";
        record.state.status = "failed";
        record.state.failure = {
          node,
          code,
          message: error instanceof WorkflowNodeError
            ? error.message.slice(0, 500)
            : "Workflow node failed.",
        };
        appendEvent(record, { type: "run.failed", node, errorCode: code });
        await this.store.save(record);
        return;
      }
    }
  }
}
