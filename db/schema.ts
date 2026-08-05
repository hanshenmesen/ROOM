import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const agentRuns = sqliteTable("agent_runs", {
  runId: text("run_id").primaryKey(),
  schemaVersion: text("schema_version").notNull(),
  status: text("status").notNull(),
  sourceHash: text("source_hash").notNull(),
  sourceType: text("source_type").notNull(),
  sourceLabel: text("source_label").notNull(),
  currentNode: text("current_node"),
  idempotencyKey: text("idempotency_key").unique(),
  failureCode: text("failure_code"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
}, (table) => [
  index("agent_runs_status_idx").on(table.status),
  index("agent_runs_source_hash_idx").on(table.sourceHash),
]);

export const agentSteps = sqliteTable("agent_steps", {
  stepId: text("step_id").primaryKey(),
  runId: text("run_id").notNull().references(() => agentRuns.runId, { onDelete: "cascade" }),
  node: text("node").notNull(),
  status: text("status").notNull(),
  attempt: integer("attempt").notNull(),
  checkpointId: text("checkpoint_id"),
  latencyMs: integer("latency_ms"),
  errorCode: text("error_code"),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
}, (table) => [
  uniqueIndex("agent_steps_run_node_attempt_idx").on(table.runId, table.node, table.attempt),
  index("agent_steps_run_idx").on(table.runId),
]);

export const agentEvents = sqliteTable("agent_events", {
  eventId: text("event_id").primaryKey(),
  runId: text("run_id").notNull().references(() => agentRuns.runId, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  type: text("type").notNull(),
  payloadJson: text("payload_json").notNull().default("{}"),
  occurredAt: text("occurred_at").notNull(),
}, (table) => [
  uniqueIndex("agent_events_run_sequence_idx").on(table.runId, table.sequence),
  index("agent_events_run_idx").on(table.runId),
]);

export const agentArtifacts = sqliteTable("agent_artifacts", {
  artifactId: text("artifact_id").primaryKey(),
  runId: text("run_id").notNull().references(() => agentRuns.runId, { onDelete: "cascade" }),
  node: text("node").notNull(),
  artifactType: text("artifact_type").notNull(),
  schemaVersion: text("schema_version").notNull(),
  storageKey: text("storage_key"),
  byteLength: integer("byte_length"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("agent_artifacts_run_idx").on(table.runId),
  uniqueIndex("agent_artifacts_run_node_type_idx").on(table.runId, table.node, table.artifactType),
]);

export const evalRuns = sqliteTable("eval_runs", {
  evalRunId: text("eval_run_id").primaryKey(),
  dataset: text("dataset").notNull(),
  runner: text("runner").notNull(),
  reportSchemaVersion: text("report_schema_version").notNull(),
  reportStorageKey: text("report_storage_key"),
  passed: integer("passed", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("eval_runs_dataset_idx").on(table.dataset),
]);
