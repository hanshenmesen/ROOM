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

type EventBase = {
  eventId: string;
  occurredAt: string;
  runId: string;
};

export type AgentRunEvent = EventBase & (
  | { type: "run.started" }
  | { type: "step.started"; step: string; attempt: number }
  | { type: "model.completed"; step: string; meta: AgentCallMeta }
  | { type: "model.failed"; step: string; meta: AgentCallMeta; errorCode: string }
  | { type: "validation.failed"; step: string; errors: string[] }
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
