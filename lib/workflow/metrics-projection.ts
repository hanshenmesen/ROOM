import type { AgentRunBudgetUsage } from "../agent-runtime/run-controls.ts";
import type { RoomWorkflowNode, WorkflowEvent, WorkflowMetrics } from "./types.ts";

/**
 * Derives `WorkflowMetrics` from the Run's event log instead of accumulating
 * counters imperatively at each mutation site. The event log is already the
 * source of truth for step projections (`projectStepsFromEvents` in
 * `durable-workflow-store.ts`); metrics now follow the same pattern, so
 * "what happened" and "how many times/how long" can never drift apart --
 * recomputing metrics from a stored event log always reproduces the same
 * numbers.
 *
 * `agentBudgetUsage` is the one exception: it comes from `AgentRunControls`
 * (a live counter, not something recorded per-event) and is passed through
 * unchanged when present.
 */
export function projectMetricsFromEvents(
  events: readonly WorkflowEvent[],
  usage?: AgentRunBudgetUsage,
): WorkflowMetrics {
  const nodeLatencyMs: Partial<Record<RoomWorkflowNode, number>> = {};
  let nodeExecutions = 0;
  let resumedCount = 0;
  for (const event of events) {
    switch (event.type) {
      case "node.started":
        nodeExecutions += 1;
        break;
      case "node.completed":
        nodeLatencyMs[event.node] = event.latencyMs;
        break;
      case "run.resumed":
        resumedCount += 1;
        break;
    }
  }
  return {
    nodeExecutions,
    nodeLatencyMs,
    resumedCount,
    ...(usage ? { agentBudgetUsage: usage } : {}),
  };
}
