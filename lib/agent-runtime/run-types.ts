import type { DiagnosticNode } from "./diagnostics.ts";

export type AgentCallMode = "json-schema" | "tool";

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
