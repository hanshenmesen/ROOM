import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { AnyD1Database, DrizzleD1Database } from "drizzle-orm/d1";
import { drizzle } from "drizzle-orm/d1";
import { agentArtifacts, agentEvents, agentRuns, agentSteps } from "../../db/schema.ts";
import * as schema from "../../db/schema.ts";
import type {
  WorkflowMetadataStore,
  WorkflowRunMetadataRow,
  WorkflowRunProjection,
} from "./durable-workflow-store.ts";

type D1Schema = typeof schema;
type D1Db = DrizzleD1Database<D1Schema>;

type AgentRunRow = typeof schema.agentRuns.$inferSelect;

/** Converts a D1 row (nullable columns) to the metadata row shape (optional keys only set when present). */
function toMetadataRow(row: AgentRunRow): WorkflowRunMetadataRow {
  const result: WorkflowRunMetadataRow = {
    runId: row.runId,
    schemaVersion: row.schemaVersion,
    status: row.status,
    sourceHash: row.sourceHash,
    sourceType: row.sourceType,
    sourceLabel: row.sourceLabel,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.currentNode !== null) result.currentNode = row.currentNode;
  if (row.idempotencyKey !== null) result.idempotencyKey = row.idempotencyKey;
  if (row.failureCode !== null) result.failureCode = row.failureCode;
  if (row.completedAt !== null) result.completedAt = row.completedAt;
  return result;
}

function isUniqueViolation(error: unknown) {
  // drizzle wraps driver errors ("Failed query: ...") with the original
  // SQLite error on the cause chain; real D1 surfaces the message directly.
  let current: unknown = error;
  while (current instanceof Error) {
    if (/unique constraint failed/i.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

/**
 * D1-backed metadata store over the existing `agent_runs` / `agent_steps` /
 * `agent_events` / `agent_artifacts` tables (see `drizzle/0000_*.sql`).
 *
 * The tables deliberately hold no source bodies, Artifact bodies, evidence
 * excerpts, or secrets — those live in object storage behind `storage_key`.
 * Integration against a real D1 binding is verified at deploy time; offline,
 * the identical contract is exercised through `InMemoryWorkflowMetadataStore`.
 */
export class D1WorkflowMetadataStore implements WorkflowMetadataStore {
  private readonly db: D1Db;

  constructor(db: D1Db) {
    this.db = db;
  }

  async insertRun(row: WorkflowRunMetadataRow) {
    try {
      await this.db.insert(agentRuns).values(row);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      if (row.idempotencyKey) {
        const existing = await this.findRunIdByIdempotencyKey(row.idempotencyKey);
        if (existing && existing !== row.runId) {
          throw new Error(`Idempotency key already belongs to ${existing}.`);
        }
      }
      throw new Error(`Workflow run already exists: ${row.runId}.`);
    }
  }

  async updateRun(row: WorkflowRunMetadataRow) {
    const result = await this.db.update(agentRuns).set(row).where(eq(agentRuns.runId, row.runId));
    if (!result.meta.changes) throw new Error(`Workflow run does not exist: ${row.runId}.`);
  }

  async getRun(runId: string) {
    const rows = await this.db.select().from(agentRuns).where(eq(agentRuns.runId, runId)).limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return toMetadataRow(row);
  }

  async findRunIdByIdempotencyKey(key: string) {
    const rows = await this.db.select({ runId: agentRuns.runId }).from(agentRuns)
      .where(eq(agentRuns.idempotencyKey, key)).limit(1);
    return rows[0]?.runId;
  }

  async replaceProjection(runId: string, projection: WorkflowRunProjection) {
    const statements: BatchItem<"sqlite">[] = [
      this.db.delete(agentSteps).where(eq(agentSteps.runId, runId)),
      this.db.delete(agentEvents).where(eq(agentEvents.runId, runId)),
      this.db.delete(agentArtifacts).where(eq(agentArtifacts.runId, runId)),
    ];
    if (projection.steps.length > 0) {
      statements.push(this.db.insert(agentSteps).values(projection.steps.map((step) => ({
        ...step,
        checkpointId: step.checkpointId ?? null,
        latencyMs: step.latencyMs ?? null,
        errorCode: step.errorCode ?? null,
        completedAt: step.completedAt ?? null,
      }))));
    }
    if (projection.events.length > 0) {
      statements.push(this.db.insert(agentEvents).values(projection.events));
    }
    if (projection.artifacts.length > 0) {
      statements.push(this.db.insert(agentArtifacts).values(projection.artifacts.map((artifact) => ({
        ...artifact,
        storageKey: artifact.storageKey ?? null,
        byteLength: artifact.byteLength ?? null,
      }))));
    }
    const [first, ...rest] = statements;
    await this.db.batch([first, ...rest]);
  }

  async listRunIds() {
    const rows = await this.db.select({ runId: agentRuns.runId }).from(agentRuns);
    return rows.map((row) => row.runId);
  }

  async listRuns() {
    const rows = await this.db.select().from(agentRuns);
    return rows.map(toMetadataRow);
  }

  async deleteRun(runId: string) {
    const statements: BatchItem<"sqlite">[] = [
      this.db.delete(agentSteps).where(eq(agentSteps.runId, runId)),
      this.db.delete(agentEvents).where(eq(agentEvents.runId, runId)),
      this.db.delete(agentArtifacts).where(eq(agentArtifacts.runId, runId)),
      this.db.delete(agentRuns).where(eq(agentRuns.runId, runId)),
    ];
    const [first, ...rest] = statements;
    await this.db.batch([first, ...rest]);
  }

  async deleteAll() {
    const statements: BatchItem<"sqlite">[] = [
      this.db.delete(agentSteps),
      this.db.delete(agentEvents),
      this.db.delete(agentArtifacts),
      this.db.delete(agentRuns),
    ];
    const [first, ...rest] = statements;
    await this.db.batch([first, ...rest]);
  }
}

/** Creates the D1 metadata store from a raw D1 binding. */
export function createD1WorkflowMetadataStore(binding: AnyD1Database) {
  return new D1WorkflowMetadataStore(drizzle(binding, { schema }));
}
