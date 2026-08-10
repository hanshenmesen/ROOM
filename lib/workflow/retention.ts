import type { DurableWorkflowStore, WorkflowRunMetadataRow } from "./durable-workflow-store.ts";

/**
 * Workflow retention policy.
 *
 * Privacy-first lifecycle for durable runs:
 * - Terminal runs (completed / failed / cancelled) keep their source body
 *   (`input.json`) for 24 hours. That window doubles as the retry window for
 *   failed runs: afterwards the source text is deleted and the run can no
 *   longer be resumed, though metadata and artifacts remain inspectable.
 * - The full run record (state body, event body, D1 metadata row) is kept for
 *   30 days, then deleted entirely.
 * - Active runs (queued / running / waiting_for_review) are never touched.
 *
 * The policy is pure planning plus explicit application, so it can be driven
 * by a Cron Trigger, an ops task, or tests, and reviewed before anything is
 * deleted.
 */
export const WORKFLOW_RETENTION = {
  sourceBodyMs: 24 * 60 * 60 * 1000,
  runRecordMs: 30 * 24 * 60 * 60 * 1000,
} as const;

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

export type WorkflowRetentionPlan = {
  /** Terminal runs older than 24h: source bodies to delete. */
  expiredSourceRunIds: string[];
  /** Terminal runs older than 30 days: full records to delete. */
  expiredRunIds: string[];
  /** Active runs older than either window: never cleaned. */
  skippedActiveRunIds: string[];
};

export function planWorkflowRetention(
  runs: WorkflowRunMetadataRow[],
  now: Date = new Date(),
): WorkflowRetentionPlan {
  const nowMs = now.getTime();
  const expiredSourceRunIds: string[] = [];
  const expiredRunIds: string[] = [];
  const skippedActiveRunIds: string[] = [];
  for (const run of runs) {
    const ageMs = nowMs - new Date(run.createdAt).getTime();
    const isTerminal = TERMINAL_STATUSES.has(run.status);
    if (!isTerminal) {
      if (ageMs > WORKFLOW_RETENTION.sourceBodyMs) skippedActiveRunIds.push(run.runId);
      continue;
    }
    if (ageMs > WORKFLOW_RETENTION.runRecordMs) {
      expiredRunIds.push(run.runId);
    } else if (ageMs > WORKFLOW_RETENTION.sourceBodyMs) {
      expiredSourceRunIds.push(run.runId);
    }
  }
  return { expiredSourceRunIds, expiredRunIds, skippedActiveRunIds };
}

export type WorkflowRetentionResult = {
  deletedSourceBodies: number;
  deletedRuns: number;
  skippedActiveRuns: number;
};

/** Applies a retention plan against a durable store. Planning and execution are separate so the plan can be reviewed first. */
export async function applyWorkflowRetention(
  store: DurableWorkflowStore,
  plan: WorkflowRetentionPlan,
): Promise<WorkflowRetentionResult> {
  for (const runId of plan.expiredSourceRunIds) {
    await store.deleteSourceBody(runId);
  }
  for (const runId of plan.expiredRunIds) {
    await store.deleteRun(runId);
  }
  return {
    deletedSourceBodies: plan.expiredSourceRunIds.length,
    deletedRuns: plan.expiredRunIds.length,
    skippedActiveRuns: plan.skippedActiveRunIds.length,
  };
}

/** Convenience wrapper: list runs, plan, and apply in one call. */
export async function enforceWorkflowRetention(
  store: DurableWorkflowStore,
  now: Date = new Date(),
): Promise<WorkflowRetentionResult> {
  const plan = planWorkflowRetention(await store.listRuns(), now);
  return applyWorkflowRetention(store, plan);
}
