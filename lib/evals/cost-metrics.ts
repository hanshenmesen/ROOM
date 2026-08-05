import type { AgentRunEvent } from "../agent-runtime/run-types.ts";

export function agentCostMetrics(events: AgentRunEvent[] = []) {
  const calls = events.filter((event) => event.type === "model.completed" || event.type === "model.failed");
  const completed = calls.filter((event) => event.type === "model.completed");
  const inputTokens = calls.map((event) => event.meta.inputTokens).filter((value): value is number => value !== undefined);
  const outputTokens = calls.map((event) => event.meta.outputTokens).filter((value): value is number => value !== undefined);
  const costs = calls.map((event) => event.meta.estimatedCost).filter((value): value is number => value !== undefined);
  const retries = events.filter((event) => event.type === "step.retried");
  const repaired = completed.some((event) => event.meta.attempt > 1);
  return {
    schemaFirstPassRate: completed.length ? retries.length ? 0 : 1 : null,
    repairSuccessRate: retries.length ? repaired ? 1 : 0 : null,
    modelCalls: calls.length,
    latencyMs: calls.reduce((total, event) => total + event.meta.latencyMs, 0),
    inputTokens: inputTokens.length ? inputTokens.reduce((total, value) => total + value, 0) : null,
    outputTokens: outputTokens.length ? outputTokens.reduce((total, value) => total + value, 0) : null,
    estimatedCost: costs.length ? costs.reduce((total, value) => total + value, 0) : null,
  };
}
