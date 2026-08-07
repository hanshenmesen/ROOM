import { agentStepName } from "./events.ts";
import type { AgentRunEvent, AgentRunStatus } from "./run-types.ts";

export function inspectAgentTrace(events: AgentRunEvent[]) {
  const modelEvents = events.filter((event) => event.type === "model.completed" || event.type === "model.failed");
  const toolEvents = events.filter((event) => event.type === "tool.completed" || event.type === "tool.failed");
  const completedModels = modelEvents.filter((event) => event.type === "model.completed");
  const completedTools = toolEvents.filter((event) => event.type === "tool.completed");
  const retries = events.filter((event) => event.type === "step.retried").length;
  const artifacts = events.filter((event) => event.type === "artifact.created").length;
  const inputTokens = modelEvents.reduce((total, event) => total + (event.meta.inputTokens || 0), 0);
  const outputTokens = modelEvents.reduce((total, event) => total + (event.meta.outputTokens || 0), 0);
  const estimatedCost = modelEvents.reduce((total, event) => total + (event.meta.estimatedCost || 0), 0);
  const latencyMs = [...modelEvents, ...toolEvents].reduce((total, event) => total + event.meta.latencyMs, 0);
  const status: AgentRunStatus = events.some((event) => event.type === "run.failed")
    ? "failed"
    : events.some((event) => event.type === "run.completed") ? "completed" : "running";
  return {
    status,
    modelCalls: modelEvents.length,
    completedModelCalls: completedModels.length,
    toolCalls: toolEvents.length,
    completedToolCalls: completedTools.length,
    retries,
    artifacts,
    inputTokens,
    outputTokens,
    estimatedCost: Number(estimatedCost.toFixed(6)),
    latencyMs: Math.round(latencyMs),
  };
}

export function agentTraceEventView(event: AgentRunEvent) {
  const step = "step" in event ? agentStepName(event.step) : "Agent Run";
  if (event.type === "run.started") return { tone: "active", title: "Agent Run 已启动", detail: "建立运行上下文与 Trace。" } as const;
  if (event.type === "run.completed") return { tone: "success", title: "Agent Run 已完成", detail: "所有必要步骤已结束。" } as const;
  if (event.type === "run.failed") return { tone: "danger", title: "Agent Run 失败", detail: event.errorCode } as const;
  if (event.type === "step.started") return { tone: "active", title: `${step}开始`, detail: `第 ${event.attempt} 次尝试` } as const;
  if (event.type === "step.completed") return { tone: "success", title: `${step}完成`, detail: "该步骤已提交。" } as const;
  if (event.type === "model.completed") return {
    tone: "success", title: `${step} · 模型调用完成`,
    detail: `${event.meta.provider}/${event.meta.model} · ${event.meta.latencyMs} ms`,
  } as const;
  if (event.type === "model.failed") return {
    tone: "danger", title: `${step} · 模型调用失败`,
    detail: `${event.errorCode} · ${event.meta.provider}/${event.meta.model}`,
  } as const;
  if (event.type === "tool.started") return { tone: "active", title: `${step} · ${event.tool}`, detail: "工具正在执行…" } as const;
  if (event.type === "tool.completed") return {
    tone: "success", title: `${step} · ${event.meta.tool}`, detail: `${event.meta.latencyMs} ms`,
  } as const;
  if (event.type === "tool.failed") return {
    tone: "danger", title: `${step} · ${event.meta.tool}`, detail: `${event.errorCode} · ${event.meta.latencyMs} ms`,
  } as const;
  if (event.type === "planner.decision") return {
    tone: event.source === "deterministic-fallback" ? "warning" : "active",
    title: `${step} · ${event.action === "continue" ? "继续研究" : "提交证据"}`,
    detail: `${event.source} · ${event.reason}`,
  } as const;
  if (event.type === "validation.failed") return { tone: "warning", title: `${step} · 校验未通过`, detail: event.errors.join("；") } as const;
  if (event.type === "security.input_quarantined") return {
    tone: "warning", title: `${step} · 已隔离不可信指令`, detail: `${event.count} 处 · ${event.categories.join("、")}`,
  } as const;
  if (event.type === "budget.exhausted") return { tone: "danger", title: `${step} · 预算用尽`, detail: event.reason } as const;
  if (event.type === "step.retried") return { tone: "warning", title: `${step} · 自动重试`, detail: `第 ${event.attempt} 次 · ${event.reason}` } as const;
  return { tone: "success", title: `${step} · 产物已生成`, detail: `${event.name} · ${event.schemaVersion}` } as const;
}

export function traceEventMetadata(event: AgentRunEvent) {
  if (event.type === "model.completed" || event.type === "model.failed") {
    return {
      Agent: event.meta.agent,
      Provider: event.meta.provider,
      Model: event.meta.model,
      Mode: event.meta.mode,
      Prompt: event.meta.promptVersion,
      "Input Token": event.meta.inputTokens ?? "未返回",
      "Output Token": event.meta.outputTokens ?? "未返回",
      "预估成本": event.meta.estimatedCost === undefined ? "未返回" : `$${event.meta.estimatedCost.toFixed(6)}`,
      ...(event.type === "model.failed" && event.diagnostic ? { 结构摘要: event.diagnostic } : {}),
    };
  }
  if (event.type === "validation.failed" && event.diagnostic) {
    return { 结构摘要: event.diagnostic };
  }
  if (event.type === "tool.completed" || event.type === "tool.failed") {
    return { 输入: event.meta.inputSummary, 输出: event.meta.outputSummary || "无输出" };
  }
  if (event.type === "tool.started") return { 输入: event.inputSummary };
  if (event.type === "planner.decision") return {
    来源: event.source,
    动作: event.action,
    下一页: event.nextUrl || "提交当前证据",
    原因: event.reason,
  };
  if (event.type === "artifact.created") return { Artifact: event.name, Schema: event.schemaVersion };
  return undefined;
}
