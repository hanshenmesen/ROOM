import type { AgentToolSummary } from "./run-types.ts";
import type { AgentTracer } from "./tracer.ts";

function boundedSummary(summary: AgentToolSummary): AgentToolSummary {
  return Object.fromEntries(Object.entries(summary).slice(0, 20).map(([key, value]) => [
    key.slice(0, 80),
    typeof value === "string" ? value.slice(0, 300) : value,
  ]));
}

function toolErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 100);
  }
  if (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name)) return "timeout";
  return "tool_failed";
}

export async function runTracedTool<T>(input: {
  tracer: AgentTracer;
  step: string;
  tool: string;
  inputSummary: AgentToolSummary;
  call: () => Promise<T> | T;
  summarizeOutput: (output: T) => AgentToolSummary;
}) {
  const toolCallId = `tool-call-${crypto.randomUUID()}`;
  const startedAt = new Date().toISOString();
  const inputSummary = boundedSummary(input.inputSummary);
  input.tracer.emit({
    type: "tool.started",
    step: input.step,
    toolCallId,
    tool: input.tool,
    inputSummary,
  });
  const started = performance.now();
  try {
    const output = await input.call();
    input.tracer.emit({
      type: "tool.completed",
      step: input.step,
      meta: {
        toolCallId,
        tool: input.tool,
        startedAt,
        latencyMs: Math.max(0, Math.round((performance.now() - started) * 100) / 100),
        inputSummary,
        outputSummary: boundedSummary(input.summarizeOutput(output)),
      },
    });
    return output;
  } catch (error) {
    input.tracer.emit({
      type: "tool.failed",
      step: input.step,
      meta: {
        toolCallId,
        tool: input.tool,
        startedAt,
        latencyMs: Math.max(0, Math.round((performance.now() - started) * 100) / 100),
        inputSummary,
      },
      errorCode: toolErrorCode(error),
    });
    throw error;
  }
}
