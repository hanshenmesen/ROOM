import type { AgentTrace } from "../types.ts";
import { agentStepName } from "./events.ts";
import type { AgentRunEvent, AgentRunSnapshot } from "./run-types.ts";

export function snapshotFromEvents(runId: string, events: AgentRunEvent[]): AgentRunSnapshot {
  const started = events.find((event) => event.type === "run.started");
  const completed = [...events].reverse().find((event) => event.type === "run.completed" || event.type === "run.failed");
  return {
    runId,
    status: events.some((event) => event.type === "run.completed")
      ? "completed"
      : events.some((event) => event.type === "run.failed")
        ? "failed"
        : "running",
    startedAt: started?.occurredAt,
    completedAt: completed?.occurredAt,
    events,
  };
}
export function summarizeAgentRun(events: AgentRunEvent[]): AgentTrace[] {
  const stepOrder: string[] = [];
  for (const event of events) {
    if (!("step" in event) || stepOrder.includes(event.step)) continue;
    stepOrder.push(event.step);
  }
  const runFailed = events.some((event) => event.type === "run.failed");
  return stepOrder.map((step): AgentTrace => {
    const stepEvents = events.filter((event) => "step" in event && event.step === step);
    const completed = stepEvents.some((event) => event.type === "step.completed");
    const failures = stepEvents.filter((event) => event.type === "model.failed" || event.type === "validation.failed");
    const calls = stepEvents
      .filter((event) => event.type === "model.completed" || event.type === "model.failed")
      .map((event) => event.meta);
    const artifacts = stepEvents
      .filter((event) => event.type === "artifact.created")
      .map((event) => event.name);
    const latencyMs = calls.reduce((total, call) => total + call.latencyMs, 0);
    const providers = [...new Set(calls.map((call) => `${call.provider}/${call.model}`))];
    const summary = calls.length
      ? `${calls.length} 次模型调用 · ${latencyMs} ms${providers.length ? ` · ${providers.join(", ")}` : ""}`
      : artifacts.length
        ? `生成 ${artifacts.join("、")}`
        : completed
          ? "确定性步骤已完成"
          : "步骤正在运行";
    return {
      id: step,
      name: agentStepName(step),
      status: completed ? (failures.length ? "warning" : "complete") : runFailed ? "failed" : "running",
      summary,
      artifacts,
      calls,
      latencyMs,
    };
  });
}
