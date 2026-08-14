import type { RoomWorkflowState, WorkflowStorePersistence } from "./types.ts";
import type { PublicRunView } from "./public-view.ts";

const DEFAULT_PERSISTENCE: WorkflowStorePersistence = {
  mode: "in-memory",
  survivesProcessRestart: false,
};

/**
 * Produces the one stable `PublicRunView` contract every `app/api/runs/*`
 * route returns. The explicit `: PublicRunView` return annotation means a
 * change here that silently reintroduces an Artifact `data` payload, a
 * `failure.message`, or an internal-only field fails `tsc`, not just an
 * eyeballed code review -- see `PublicRunView`'s own doc comment.
 */
export function publicWorkflowSnapshot(
  state: RoomWorkflowState,
  persistence: WorkflowStorePersistence = DEFAULT_PERSISTENCE,
): PublicRunView {
  return {
    schemaVersion: state.schemaVersion,
    runId: state.runId,
    status: state.status,
    sourceHash: state.sourceHash,
    source: state.source,
    currentNode: state.currentNode,
    completedNodes: state.completedNodes,
    attempts: state.attempts,
    checkpoints: state.checkpoints,
    metrics: state.metrics,
    review: state.activeReview ? {
      type: state.activeReview.type,
      node: state.activeReview.node,
      requestedAt: state.activeReview.requestedAt,
      schemaVersion: state.activeReview.report.schemaVersion,
      primarySource: state.activeReview.report.primarySource,
      supplementSource: state.activeReview.report.supplementSource,
      conflicts: state.activeReview.report.conflicts,
    } : undefined,
    reviewHistory: state.reviewHistory.map((entry) => ({
      type: entry.type,
      node: entry.node,
      resolvedAt: entry.resolvedAt,
      resolutionCount: entry.userClaims.length,
    })),
    artifacts: Object.fromEntries(Object.entries(state.artifacts).map(([name, envelope]) => [name, {
      artifactType: envelope?.artifactType,
      schemaVersion: envelope?.schemaVersion,
    }])),
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    completedAt: state.completedAt,
    failure: state.failure ? {
      node: state.failure.node,
      code: state.failure.code,
    } : undefined,
    persistence,
  };
}

/** Alias matching the `toPublicRunView(record) => PublicRunView` naming used elsewhere in ROOM's projection functions (e.g. `projectStepsFromEvents`, `projectMetricsFromEvents`). */
export const toPublicRunView = publicWorkflowSnapshot;
