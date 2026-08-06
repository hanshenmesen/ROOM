import { ROOM_WORKFLOW_SCHEMA_VERSION, ROOM_WORKFLOW_NODES, type RoomWorkflowArtifacts, type RoomWorkflowNode, type RoomWorkflowState, type WorkflowEvent, type WorkflowRecord, type WorkflowSourceInput, type WorkflowStore } from "./types.ts";
import type { WorkflowObjectStore } from "./object-store.ts";

/**
 * Durable Workflow store boundary.
 *
 * Layout contract (mirrors `db/schema.ts` and the production D1/R2 design):
 *
 * - D1 keeps only queryable metadata: one `agent_runs` row per run plus
 *   event-sourced projections into `agent_steps`, `agent_events`, and
 *   `agent_artifacts`. No source body, Artifact body, evidence excerpt, or
 *   secret is ever written to metadata.
 * - Object storage (private R2 in production) keeps the full bodies the
 *   engine needs to reconstruct a `WorkflowRecord` after a process restart:
 *   `state.json`, `input.json`, and `events.json` per run.
 *
 * Recovery path: `get()` reads the metadata row first (existence +
 * idempotency key), then rebuilds the record from bodies. A missing body is
 * treated as data corruption and fails explicitly instead of silently
 * returning a partial record.
 */

export type WorkflowRunMetadataRow = {
  runId: string;
  schemaVersion: string;
  status: string;
  sourceHash: string;
  sourceType: string;
  sourceLabel: string;
  currentNode?: string;
  idempotencyKey?: string;
  failureCode?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type WorkflowStepRow = {
  stepId: string;
  runId: string;
  node: string;
  status: "started" | "completed" | "failed";
  attempt: number;
  checkpointId?: string;
  latencyMs?: number;
  errorCode?: string;
  startedAt: string;
  completedAt?: string;
};

export type WorkflowEventRow = {
  eventId: string;
  runId: string;
  sequence: number;
  type: string;
  payloadJson: string;
  occurredAt: string;
};

export type WorkflowArtifactRow = {
  artifactId: string;
  runId: string;
  node: string;
  artifactType: string;
  schemaVersion: string;
  storageKey?: string;
  byteLength?: number;
  createdAt: string;
};

export type WorkflowRunProjection = {
  steps: WorkflowStepRow[];
  events: WorkflowEventRow[];
  artifacts: WorkflowArtifactRow[];
};

/**
 * Metadata persistence boundary. The D1 implementation lives in
 * `d1-metadata-store.ts`; the in-memory implementation keeps the durable
 * store fully testable offline.
 */
export type WorkflowMetadataStore = {
  insertRun(row: WorkflowRunMetadataRow): Promise<void>;
  updateRun(row: WorkflowRunMetadataRow): Promise<void>;
  getRun(runId: string): Promise<WorkflowRunMetadataRow | undefined>;
  findRunIdByIdempotencyKey(key: string): Promise<string | undefined>;
  replaceProjection(runId: string, projection: WorkflowRunProjection): Promise<void>;
  listRunIds(): Promise<string[]>;
  listRuns(): Promise<WorkflowRunMetadataRow[]>;
  deleteRun(runId: string): Promise<void>;
  deleteAll(): Promise<void>;
};

const ARTIFACT_PRODUCING_NODE: Record<keyof RoomWorkflowArtifacts, RoomWorkflowNode> = {
  profile: "extract_profile",
  mergeReport: "extract_profile",
  creativeBrief: "direct_world",
  world: "compile_world",
  checkReport: "check_world",
};

const OBJECT_KEY_PREFIX = "workflow/v1/runs/";

function stateObjectKey(runId: string) {
  return `${OBJECT_KEY_PREFIX}${runId}/state.json`;
}

function inputObjectKey(runId: string) {
  return `${OBJECT_KEY_PREFIX}${runId}/input.json`;
}

function eventsObjectKey(runId: string) {
  return `${OBJECT_KEY_PREFIX}${runId}/events.json`;
}

export function runMetadataFromRecord(record: WorkflowRecord): WorkflowRunMetadataRow {
  const { state } = record;
  return {
    runId: state.runId,
    schemaVersion: state.schemaVersion,
    status: state.status,
    sourceHash: state.sourceHash,
    sourceType: state.source.type,
    sourceLabel: state.source.label,
    currentNode: state.currentNode,
    idempotencyKey: record.idempotencyKey,
    failureCode: state.failure?.code,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    completedAt: state.completedAt,
  };
}

/**
 * Projects the run's ordered events onto the `agent_steps` table shape. The
 * event log is the source of truth; steps, events, and artifact rows are
 * rebuilt on every save, so the projection can always be regenerated after a
 * schema review without replaying model calls.
 */
export function projectStepsFromEvents(record: WorkflowRecord): WorkflowStepRow[] {
  const runId = record.state.runId;
  const rows = new Map<string, WorkflowStepRow>();
  const latestAttemptByNode = new Map<RoomWorkflowNode, number>();
  const rowFor = (node: RoomWorkflowNode) => {
    const attempt = latestAttemptByNode.get(node);
    return attempt === undefined ? undefined : rows.get(`${node}:${attempt}`);
  };
  for (const event of record.events) {
    switch (event.type) {
      case "node.started": {
        latestAttemptByNode.set(event.node, event.attempt);
        rows.set(`${event.node}:${event.attempt}`, {
          stepId: `${runId}:${event.node}:${event.attempt}`,
          runId,
          node: event.node,
          status: "started",
          attempt: event.attempt,
          startedAt: event.occurredAt,
        });
        break;
      }
      case "node.completed": {
        const row = rowFor(event.node);
        if (row) {
          row.status = "completed";
          row.latencyMs = event.latencyMs;
          row.completedAt = event.occurredAt;
        }
        break;
      }
      case "checkpoint.saved": {
        const row = rowFor(event.node);
        if (row) row.checkpointId = event.checkpointId;
        break;
      }
      case "run.failed": {
        const row = rowFor(event.node);
        if (row) {
          row.status = "failed";
          row.errorCode = event.errorCode;
          row.completedAt = event.occurredAt;
        }
        break;
      }
    }
  }
  return ROOM_WORKFLOW_NODES.flatMap((node) => {
    const attempts = latestAttemptByNode.get(node);
    if (attempts === undefined) return [];
    return Array.from({ length: attempts }, (_, index) => rows.get(`${node}:${index + 1}`))
      .filter((row): row is WorkflowStepRow => Boolean(row));
  });
}

function projectEvents(record: WorkflowRecord): WorkflowEventRow[] {
  return record.events.map((event) => {
    const { eventId, runId, sequence, type, occurredAt, ...payload } = event;
    return {
      eventId,
      runId,
      sequence,
      type,
      payloadJson: JSON.stringify(payload),
      occurredAt,
    };
  });
}

function projectArtifacts(record: WorkflowRecord): WorkflowArtifactRow[] {
  const { state } = record;
  return (Object.entries(state.artifacts) as [keyof RoomWorkflowArtifacts, RoomWorkflowArtifacts[keyof RoomWorkflowArtifacts]][])
    .filter((entry): entry is [keyof RoomWorkflowArtifacts, NonNullable<typeof entry[1]>] => Boolean(entry[1]))
    .map(([key, envelope]) => ({
      artifactId: `${state.runId}:${ARTIFACT_PRODUCING_NODE[key]}:${envelope.artifactType}`,
      runId: state.runId,
      node: ARTIFACT_PRODUCING_NODE[key],
      artifactType: envelope.artifactType,
      schemaVersion: envelope.schemaVersion,
      storageKey: stateObjectKey(state.runId),
      byteLength: new TextEncoder().encode(JSON.stringify(envelope)).byteLength,
      createdAt: state.updatedAt,
    }));
}

export function projectRun(record: WorkflowRecord): WorkflowRunProjection {
  return {
    steps: projectStepsFromEvents(record),
    events: projectEvents(record),
    artifacts: projectArtifacts(record),
  };
}

/**
 * Metadata + object storage composition implementing the same `WorkflowStore`
 * contract as the in-memory store, with identical conflict error messages so
 * the engine and API layers behave the same on either backend.
 */
export class DurableWorkflowStore implements WorkflowStore {
  readonly persistence = { mode: "durable-d1-r2", survivesProcessRestart: true } as const;

  private readonly metadata: WorkflowMetadataStore;
  private readonly objects: WorkflowObjectStore;

  constructor(metadata: WorkflowMetadataStore, objects: WorkflowObjectStore) {
    this.metadata = metadata;
    this.objects = objects;
  }

  async create(record: WorkflowRecord) {
    await this.metadata.insertRun(runMetadataFromRecord(record));
    await this.writeBodies(record);
    await this.metadata.replaceProjection(record.state.runId, projectRun(record));
  }

  async get(runId: string) {
    const row = await this.metadata.getRun(runId);
    if (!row) return undefined;
    const [stateBody, inputBody, eventsBody] = await Promise.all([
      this.objects.get(stateObjectKey(runId)),
      this.objects.get(inputObjectKey(runId)),
      this.objects.get(eventsObjectKey(runId)),
    ]);
    if (stateBody === undefined) {
      throw new Error(`Workflow run ${runId} is missing durable bodies in object storage.`);
    }
    const state = JSON.parse(stateBody) as RoomWorkflowState;
    if (state.schemaVersion !== ROOM_WORKFLOW_SCHEMA_VERSION) {
      throw new Error(`Unsupported workflow state schema version: ${state.schemaVersion}.`);
    }
    // A missing input body means retention deleted the source text after the
    // 24-hour terminal window. The run stays inspectable via a tombstone, but
    // the engine rejects resuming such runs because the source is gone.
    const input: WorkflowSourceInput = inputBody === undefined
      ? { type: "text", label: `${row.sourceLabel}（源正文已按保留策略清理）`, text: "" }
      : JSON.parse(inputBody) as WorkflowSourceInput;
    const events = eventsBody === undefined ? [] : JSON.parse(eventsBody) as WorkflowEvent[];
    const record: WorkflowRecord = { state, input, events };
    if (row.idempotencyKey) record.idempotencyKey = row.idempotencyKey;
    return record;
  }

  async save(record: WorkflowRecord) {
    await this.metadata.updateRun(runMetadataFromRecord(record));
    await this.writeBodies(record);
    await this.metadata.replaceProjection(record.state.runId, projectRun(record));
  }

  async findRunIdByIdempotencyKey(key: string) {
    return this.metadata.findRunIdByIdempotencyKey(key);
  }

  async clear() {
    const runIds = await this.metadata.listRunIds();
    await Promise.all(runIds.flatMap((runId) => [
      this.objects.delete(stateObjectKey(runId)),
      this.objects.delete(inputObjectKey(runId)),
      this.objects.delete(eventsObjectKey(runId)),
    ]));
    await this.metadata.deleteAll();
  }

  /** Metadata rows for retention planning and ops inspection. */
  async listRuns() {
    return this.metadata.listRuns();
  }

  /** Deletes only the source body, keeping state/events/metadata inspectable. */
  async deleteSourceBody(runId: string) {
    await this.objects.delete(inputObjectKey(runId));
  }

  /** Deletes the full run record: all bodies plus the metadata row. */
  async deleteRun(runId: string) {
    await Promise.all([
      this.objects.delete(stateObjectKey(runId)),
      this.objects.delete(inputObjectKey(runId)),
      this.objects.delete(eventsObjectKey(runId)),
    ]);
    await this.metadata.deleteRun(runId);
  }

  private async writeBodies(record: WorkflowRecord) {
    const runId = record.state.runId;
    await Promise.all([
      this.objects.put(stateObjectKey(runId), JSON.stringify(record.state)),
      this.objects.put(inputObjectKey(runId), JSON.stringify(record.input)),
      this.objects.put(eventsObjectKey(runId), JSON.stringify(record.events)),
    ]);
  }
}

/**
 * In-memory metadata store. It keeps the durable composition testable offline
 * and documents the exact metadata surface: everything stored here must stay
 * free of source bodies, Artifact bodies, and secrets.
 */
export class InMemoryWorkflowMetadataStore implements WorkflowMetadataStore {
  private readonly runs = new Map<string, WorkflowRunMetadataRow>();
  private readonly projections = new Map<string, WorkflowRunProjection>();

  async insertRun(row: WorkflowRunMetadataRow) {
    if (this.runs.has(row.runId)) throw new Error(`Workflow run already exists: ${row.runId}.`);
    if (row.idempotencyKey) {
      const existing = await this.findRunIdByIdempotencyKey(row.idempotencyKey);
      if (existing) throw new Error(`Idempotency key already belongs to ${existing}.`);
    }
    this.runs.set(row.runId, structuredClone(row));
  }

  async updateRun(row: WorkflowRunMetadataRow) {
    if (!this.runs.has(row.runId)) throw new Error(`Workflow run does not exist: ${row.runId}.`);
    this.runs.set(row.runId, structuredClone(row));
  }

  async getRun(runId: string) {
    const row = this.runs.get(runId);
    return row ? structuredClone(row) : undefined;
  }

  async findRunIdByIdempotencyKey(key: string) {
    for (const row of this.runs.values()) {
      if (row.idempotencyKey === key) return row.runId;
    }
    return undefined;
  }

  async replaceProjection(runId: string, projection: WorkflowRunProjection) {
    this.projections.set(runId, structuredClone(projection));
  }

  async listRunIds() {
    return [...this.runs.keys()];
  }

  async listRuns() {
    return [...this.runs.values()].map((row) => structuredClone(row));
  }

  async deleteRun(runId: string) {
    this.runs.delete(runId);
    this.projections.delete(runId);
  }

  async deleteAll() {
    this.runs.clear();
    this.projections.clear();
  }

  /** Test helper: inspect the metadata surface for privacy assertions. */
  dump() {
    return {
      runs: [...this.runs.values()].map((row) => structuredClone(row)),
      projections: [...this.projections.values()].map((projection) => structuredClone(projection)),
    };
  }
}
