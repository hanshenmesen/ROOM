import type { RoomWorkflowState } from "./types.ts";

export function publicWorkflowSnapshot(state: RoomWorkflowState) {
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
    persistence: {
      mode: "in-memory",
      survivesProcessRestart: false,
    },
  };
}
