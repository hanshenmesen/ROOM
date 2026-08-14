import type { KnownArtifactEnvelope } from "../agent-runtime/artifact-envelope.ts";
import type {
  ProfileMergeReport,
  ProfileReviewResolution,
  UserConfirmedClaim,
} from "../profile-merge.ts";
import type { ParsedProfile } from "../types.ts";
import type { WebsiteResearchState } from "../agents/website/state.ts";
import type { AgentAttachment } from "../agents/profile/types.ts";
import type { AgentRunBudgetUsage } from "../agent-runtime/run-controls.ts";
import type { RoomRunContext } from "../agent-runtime/run-context.ts";

export const ROOM_WORKFLOW_SCHEMA_VERSION = "room-workflow-state.v3" as const;

export const ROOM_WORKFLOW_NODES = [
  "prepare_source",
  "extract_identity",
  "extract_inventory",
  "research_website",
  "merge_profile",
  "review_profile",
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

export type WorkflowSourceType = "text" | "url" | "pdf" | "image";

/**
 * A file-based source (PDF/image) carries its bytes as a base64 `attachment`
 * instead of `text`. Keeping it on the same `WorkflowSourceInput` shape lets
 * `prepare_source` checkpoint the (potentially slow) local extraction step
 * once, so a later node failure retries from `prepare_source`'s output
 * instead of re-uploading and re-parsing the original file.
 */
export type WorkflowSourceInput = {
  type: WorkflowSourceType;
  label: string;
  text: string;
  attachment?: {
    mediaType: AgentAttachment["mediaType"];
    data: string;
  };
  mode?: "deterministic" | "agent";
  followWebsite?: boolean;
  /** Explicit personal website URL, overriding auto-detection from the parsed Profile. */
  website?: string;
};

export type PreparedWorkflowSource = {
  type: WorkflowSourceType;
  label: string;
  lineCount: number;
  byteLength: number;
};

/**
 * Output of the `prepare_source` node for file-based inputs. `mode: "text"`
 * means local extraction (e.g. a PDF with a text layer, read by a provider
 * without document-block support) already produced usable text, so
 * `extract_identity`/`extract_inventory` can run their normal checkpointed
 * shards against it. `mode: "attachment"` means the original attachment
 * must be sent to a multimodal provider; extraction then happens as one
 * un-sharded call in `extract_inventory`.
 */
export type PreparedSourceCheckpoint =
  | { mode: "text"; text: string; pageCount?: number }
  | {
    mode: "attachment";
    attachment: { mediaType: AgentAttachment["mediaType"]; data: string };
    preparsedText: string;
    pageCount?: number;
  };

export type RoomWorkflowArtifacts = {
  preparedSource?: KnownArtifactEnvelope<"prepared-source">;
  identityDraft?: KnownArtifactEnvelope<"profile-identity">;
  inventoryDraft?: KnownArtifactEnvelope<"profile-inventory">;
  resumeProfile?: KnownArtifactEnvelope<"resume-profile">;
  websiteResearch?: KnownArtifactEnvelope<"website-research">;
  profile?: KnownArtifactEnvelope<"profile">;
  mergeReport?: KnownArtifactEnvelope<"profile-merge-report">;
  creativeBrief?: KnownArtifactEnvelope<"creative-brief">;
  world?: KnownArtifactEnvelope<"world">;
  checkReport?: KnownArtifactEnvelope<"check-report">;
};

export type WebsiteResearchCheckpoint = {
  profile: ParsedProfile;
  state: WebsiteResearchState;
};

/**
 * A single Run-scoped context, aggregating tracer/budget controls/
 * cancellation/provider config (see `RoomRunContext`). This replaced the
 * previous `{ providerConfig?, tracer?, runtimeControls?, signal? }` bag,
 * which let `signal` disagree with `runtimeControls.signal` because they
 * were two independent optional fields instead of one source of truth.
 */
export type WorkflowExecutionOptions = {
  context: RoomRunContext;
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
  agentBudgetUsage?: AgentRunBudgetUsage;
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
  execution?: WorkflowExecutionOptions;
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
