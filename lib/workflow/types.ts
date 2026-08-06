import type { KnownArtifactEnvelope } from "../agent-runtime/artifact-envelope.ts";
import type {
  ProfileMergeReport,
  ProfileReviewResolution,
  UserConfirmedClaim,
} from "../profile-merge.ts";

export const ROOM_WORKFLOW_SCHEMA_VERSION = "room-workflow-state.v2" as const;

export const ROOM_WORKFLOW_NODES = [
  "prepare_source",
  "extract_profile",
  "direct_world",
  "compile_world",
  "check_world",
  "complete",
] as const;

export type RoomWorkflowNode = (typeof ROOM_WORKFLOW_NODES)[number];
export type RoomWorkflowStatus =
  | "queued"
  | "running"
  | "waiting_for_review"
  | "completed"
  | "failed"
  | "cancelled";

export type WorkflowSourceInput = {
  type: "text";
  label: string;
  text: string;
};

export type PreparedWorkflowSource = {
  type: "text";
  label: string;
  lineCount: number;
  byteLength: number;
};

export type RoomWorkflowArtifacts = {
  profile?: KnownArtifactEnvelope<"profile">;
  mergeReport?: KnownArtifactEnvelope<"profile-merge-report">;
  creativeBrief?: KnownArtifactEnvelope<"creative-brief">;
  world?: KnownArtifactEnvelope<"world">;
  checkReport?: KnownArtifactEnvelope<"check-report">;
};

export type WorkflowCheckpoint = {
  checkpointId: string;
  completedNode: RoomWorkflowNode;
  nextNode?: RoomWorkflowNode;
  createdAt: string;
  artifactVersions: Partial<Record<keyof RoomWorkflowArtifacts, string>>;
};

export type WorkflowMetrics = {
  nodeExecutions: number;
  nodeLatencyMs: Partial<Record<RoomWorkflowNode, number>>;
  resumedCount: number;
};

export type WorkflowReviewRequest = {
  type: "profile_conflict";
  report: ProfileMergeReport;
};

export type ActiveWorkflowReview = WorkflowReviewRequest & {
  node: RoomWorkflowNode;
  requestedAt: string;
};

export type WorkflowReviewHistoryEntry = {
  type: "profile_conflict";
  node: RoomWorkflowNode;
  resolvedAt: string;
  userClaims: UserConfirmedClaim[];
};

export type RoomWorkflowState = {
  schemaVersion: typeof ROOM_WORKFLOW_SCHEMA_VERSION;
  runId: string;
  status: RoomWorkflowStatus;
  sourceHash: string;
  source: PreparedWorkflowSource;
  currentNode?: RoomWorkflowNode;
  completedNodes: RoomWorkflowNode[];
  attempts: Partial<Record<RoomWorkflowNode, number>>;
  artifacts: RoomWorkflowArtifacts;
  checkpoints: WorkflowCheckpoint[];
  metrics: WorkflowMetrics;
  activeReview?: ActiveWorkflowReview;
  reviewHistory: WorkflowReviewHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  failure?: {
    node: RoomWorkflowNode;
    code: string;
    message: string;
  };
};

type WorkflowEventBase = {
  eventId: string;
  runId: string;
  sequence: number;
  occurredAt: string;
};

export type WorkflowEvent = WorkflowEventBase & (
  | { type: "run.queued" }
  | { type: "run.started" }
  | { type: "run.resumed"; fromNode?: RoomWorkflowNode }
  | { type: "node.started"; node: RoomWorkflowNode; attempt: number }
  | { type: "checkpoint.saved"; node: RoomWorkflowNode; checkpointId: string }
  | { type: "node.completed"; node: RoomWorkflowNode; latencyMs: number }
  | { type: "review.requested"; node: RoomWorkflowNode; conflictCount: number }
  | { type: "review.completed"; node: RoomWorkflowNode; resolutionCount: number }
  | { type: "run.failed"; node: RoomWorkflowNode; errorCode: string }
  | { type: "run.cancelled"; atNode?: RoomWorkflowNode }
  | { type: "run.completed" }
);

export type WorkflowRecord = {
  state: RoomWorkflowState;
  input: WorkflowSourceInput;
  events: WorkflowEvent[];
  idempotencyKey?: string;
};

/** Describes how durable a Workflow store backend is for public snapshots. */
export type WorkflowStorePersistence = {
  mode: "in-memory" | "durable-d1-r2";
  survivesProcessRestart: boolean;
};

export type WorkflowStore = {
  create(record: WorkflowRecord): Promise<void>;
  get(runId: string): Promise<WorkflowRecord | undefined>;
  save(record: WorkflowRecord): Promise<void>;
  findRunIdByIdempotencyKey(key: string): Promise<string | undefined>;
  clear?(): Promise<void>;
  /** Optional durability descriptor exposed through public Run snapshots. */
  readonly persistence?: WorkflowStorePersistence;
};

export type WorkflowNodeContext = {
  runId: string;
  node: RoomWorkflowNode;
  attempt: number;
  input: WorkflowSourceInput;
  state: Readonly<RoomWorkflowState>;
};

export type WorkflowNodeOutput = {
  artifacts?: Partial<RoomWorkflowArtifacts>;
  review?: WorkflowReviewRequest;
};

export type WorkflowNodeHandler = (
  context: WorkflowNodeContext,
) => Promise<Partial<RoomWorkflowArtifacts> | WorkflowNodeOutput | void>
  | Partial<RoomWorkflowArtifacts>
  | WorkflowNodeOutput
  | void;

export type WorkflowNodeHandlers = Record<RoomWorkflowNode, WorkflowNodeHandler>;

export type WorkflowReviewSubmission = ProfileReviewResolution[];
