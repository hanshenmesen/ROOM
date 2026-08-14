import type { ProfileConflict } from "../profile-merge.ts";
import type {
  PreparedWorkflowSource,
  RoomWorkflowArtifacts,
  RoomWorkflowNode,
  RoomWorkflowStatus,
  WorkflowCheckpoint,
  WorkflowMetrics,
  WorkflowStorePersistence,
} from "./types.ts";

export type PublicRunArtifactSummary = {
  artifactType?: string;
  schemaVersion?: string;
};

/** Public projection of an active review request: no raw evidence excerpt beyond what `ProfileConflict` already exposes to the reviewing user. */
export type PublicRunReview = {
  type: "profile_conflict";
  node: RoomWorkflowNode;
  requestedAt: string;
  schemaVersion: string;
  primarySource: string;
  supplementSource: string;
  conflicts: ProfileConflict[];
};

export type PublicRunReviewHistoryEntry = {
  type: "profile_conflict";
  node: RoomWorkflowNode;
  resolvedAt: string;
  resolutionCount: number;
};

/** Public projection of a failed Run: the failure `code` is exposed for UI branching, the internal `message` never is. */
export type PublicRunFailure = {
  node: RoomWorkflowNode;
  code: string;
};

/**
 * The one stable contract every `app/api/runs/*` route returns to the
 * client. Fixing this as an explicit type (rather than letting call sites
 * infer it from whatever `RoomWorkflowState` currently looks like) means a
 * backend-only change to `RoomWorkflowState` -- adding an internal field,
 * renaming a checkpoint bookkeeping field -- cannot silently change the
 * public wire shape: `toPublicRunView()`'s return type is checked against
 * this declaration, not the other way around.
 *
 * Deliberately excludes: any Artifact `data` payload (only
 * `artifactType`/`schemaVersion` -- see `PublicRunArtifactSummary`), the
 * internal `failure.message` (only `failure.code`), and the source body
 * (only the already-redacted `PreparedWorkflowSource` summary).
 */
export type PublicRunView = {
  schemaVersion: string;
  runId: string;
  status: RoomWorkflowStatus;
  sourceHash: string;
  source: PreparedWorkflowSource;
  currentNode?: RoomWorkflowNode;
  completedNodes: RoomWorkflowNode[];
  attempts: Partial<Record<RoomWorkflowNode, number>>;
  checkpoints: WorkflowCheckpoint[];
  metrics: WorkflowMetrics;
  review?: PublicRunReview;
  reviewHistory: PublicRunReviewHistoryEntry[];
  artifacts: Partial<Record<keyof RoomWorkflowArtifacts, PublicRunArtifactSummary>>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  failure?: PublicRunFailure;
  persistence: WorkflowStorePersistence;
};
