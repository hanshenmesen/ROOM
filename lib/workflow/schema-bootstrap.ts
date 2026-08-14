/**
 * Idempotent (`CREATE TABLE IF NOT EXISTS`) mirror of the four Workflow
 * tables in `drizzle/0000_optimal_night_nurse.sql`.
 *
 * A freshly bound D1 database (a real Cloudflare resource, or the local
 * miniflare simulation `.openai/hosting.json`'s `d1` field turns on for
 * `vinext dev`) starts out empty. Without this bootstrap step, "anonymous
 * local Run recovery" would need a separate `wrangler d1 migrations apply`
 * command before the durable store became usable, which defeats the point
 * of a store that is *supposed to* just work once the binding exists.
 * `resolveWorkflowStore()` runs this once per process before handing back a
 * `DurableWorkflowStore`.
 *
 * Keep this in sync with `drizzle/0000_optimal_night_nurse.sql` and
 * `db/schema.ts` when the Workflow schema changes; drizzle-kit remains the
 * source of truth for the migration history — this is only a bootstrap
 * convenience so the same schema also exists when nothing ran migrations.
 */
export const WORKFLOW_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS agent_runs (
    run_id text PRIMARY KEY NOT NULL,
    schema_version text NOT NULL,
    status text NOT NULL,
    source_hash text NOT NULL,
    source_type text NOT NULL,
    source_label text NOT NULL,
    current_node text,
    idempotency_key text,
    failure_code text,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at text
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS agent_runs_idempotency_key_unique ON agent_runs (idempotency_key)",
  "CREATE INDEX IF NOT EXISTS agent_runs_status_idx ON agent_runs (status)",
  "CREATE INDEX IF NOT EXISTS agent_runs_source_hash_idx ON agent_runs (source_hash)",
  `CREATE TABLE IF NOT EXISTS agent_steps (
    step_id text PRIMARY KEY NOT NULL,
    run_id text NOT NULL,
    node text NOT NULL,
    status text NOT NULL,
    attempt integer NOT NULL,
    checkpoint_id text,
    latency_ms integer,
    error_code text,
    started_at text NOT NULL,
    completed_at text,
    FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON UPDATE no action ON DELETE cascade
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS agent_steps_run_node_attempt_idx ON agent_steps (run_id, node, attempt)",
  "CREATE INDEX IF NOT EXISTS agent_steps_run_idx ON agent_steps (run_id)",
  `CREATE TABLE IF NOT EXISTS agent_events (
    event_id text PRIMARY KEY NOT NULL,
    run_id text NOT NULL,
    sequence integer NOT NULL,
    type text NOT NULL,
    payload_json text DEFAULT '{}' NOT NULL,
    occurred_at text NOT NULL,
    FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON UPDATE no action ON DELETE cascade
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS agent_events_run_sequence_idx ON agent_events (run_id, sequence)",
  "CREATE INDEX IF NOT EXISTS agent_events_run_idx ON agent_events (run_id)",
  `CREATE TABLE IF NOT EXISTS agent_artifacts (
    artifact_id text PRIMARY KEY NOT NULL,
    run_id text NOT NULL,
    node text NOT NULL,
    artifact_type text NOT NULL,
    schema_version text NOT NULL,
    storage_key text,
    byte_length integer,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON UPDATE no action ON DELETE cascade
  )`,
  "CREATE INDEX IF NOT EXISTS agent_artifacts_run_idx ON agent_artifacts (run_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS agent_artifacts_run_node_type_idx ON agent_artifacts (run_id, node, artifact_type)",
];

type MinimalD1Database = {
  prepare(sql: string): { run(): Promise<unknown> };
};

/** Applies every bootstrap statement in order (tables before their indexes/FKs). */
export async function ensureWorkflowSchema(db: MinimalD1Database) {
  for (const statement of WORKFLOW_SCHEMA_STATEMENTS) {
    await db.prepare(statement).run();
  }
}
