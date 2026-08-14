import type { DiagnosticNode } from "./diagnostics.ts";

export type AgentCallMode = "json-schema" | "tool";

/**
 * A non-sensitive reference to one piece of content a model call consumed
 * (an Artifact, a prompt fragment, ...), identified by type/version/hash
 * instead of by copying the content itself. See `AgentCallMeta.inputRefs`.
 */
export type AgentCallInputRef = {
  /** e.g. "resume-profile", "website-research-observation", "system-prompt". */
  artifactType: string;
  schemaVersion: string;
  /** sha256 hex digest of the exact content sent, for cross-run reproducibility checks without storing the content. */
  contentHash: string;
  /** Which part of the artifact was actually selected/sent, if less than the whole thing. */
  selection?: { field?: string; range?: [number, number] };
};

export type AgentCallMeta = {
  callId: string;
  agent: string;
  shard?: string;
  provider: string;
  model: string;
  mode: AgentCallMode;
  promptVersion: string;
  startedAt: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  attempt: number;
  fallbackCount: number;
  stopReason?: string;
  /**
   * Model context should be rebuildable without recording sensitive
   * positional content: a template/adapter identity plus references to
   * whatever was fed into the call, so a Provider or
   * Prompt regression can be localized to an exact template+artifact
   * version pairing purely from the trace, without ever persisting the
   * prompt or source text itself.
   */
  templateId?: string;
  adapterVersion?: string;
  inputRefs?: AgentCallInputRef[];
  /** sha256 hex digest of the exact `userContent` sent for this call, computed unconditionally by `ModelService`. */
  contentHash?: string;
};
export type AgentCallResult<T> = {
  data: T;
  meta: AgentCallMeta;
};

export type AgentToolSummary = Record<string, string | number | boolean | null>;

export type AgentToolCallMeta = {
  toolCallId: string;
  tool: string;
  startedAt: string;
  latencyMs: number;
  inputSummary: AgentToolSummary;
  outputSummary?: AgentToolSummary;
};

type EventBase = {
  eventId: string;
  occurredAt: string;
  runId: string;
};

export type AgentRunEvent = EventBase & (
  | { type: "run.started" }
  | { type: "step.started"; step: string; attempt: number }
  | { type: "model.completed"; step: string; meta: AgentCallMeta }
  // `diagnostic` carries a PII-free structural summary of the offending
  // payload (see diagnostics.ts) so shape failures are diagnosable from the
  // trace alone -- no server-log spelunking, no reproduction rerun.
  | { type: "model.failed"; step: string; meta: AgentCallMeta; errorCode: string; diagnostic?: DiagnosticNode }
  | { type: "tool.started"; step: string; toolCallId: string; tool: string; inputSummary: AgentToolSummary }
  | { type: "tool.completed"; step: string; meta: AgentToolCallMeta }
  | { type: "tool.failed"; step: string; meta: AgentToolCallMeta; errorCode: string }
  | { type: "validation.failed"; step: string; errors: string[]; diagnostic?: DiagnosticNode }
  // Emitted when deterministic evidence repair rebuilt a citation from the
  // model's verbatim excerpt instead of failing the run.
  | { type: "evidence.repaired"; step: string; count: number; targets: string[] }
  | { type: "security.input_quarantined"; step: string; count: number; categories: string[] }
  | { type: "budget.exhausted"; step: string; reason: string; usage: AgentToolSummary }
  | { type: "planner.decision"; step: string; action: "continue" | "submit"; reason: string; nextUrl?: string; source: "model" | "deterministic" | "deterministic-fallback" }
  | { type: "step.retried"; step: string; attempt: number; reason: string }
  | { type: "artifact.created"; step: string; name: string; schemaVersion: string }
  | { type: "step.completed"; step: string }
  | { type: "run.failed"; errorCode: string }
  | { type: "run.completed" }
);

export type AgentRunStatus = "running" | "completed" | "failed";

export type AgentRunSnapshot = {
  runId: string;
  status: AgentRunStatus;
  startedAt?: string;
  completedAt?: string;
  events: AgentRunEvent[];
};
