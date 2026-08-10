import type { AgentRunEvent } from "./run-types.ts";

const STEP_NAMES: Record<string, string> = {
  "source.prepare": "资料预处理",
  "profile.parse": "资料解析",
  "profile.identity": "身份 Agent",
  "profile.items": "内容 Agent",
  "profile.research": "研究 Agent",
  "profile.career": "经历 Agent",
  "profile.validate": "档案验证",
  "website.fetch": "网站读取",
  "website.tool-research": "网站研究工具循环",
  "website.plan": "网站研究规划 Agent",
  "website.identity": "网站身份 Agent",
  "website.items": "网站内容 Agent",
  "website.research": "网站研究 Agent",
  "website.career": "网站经历 Agent",
  "website.validate": "网站档案验证",
  "profile.merge": "资料合并",
  "creative.retrieve": "创意检索",
  "world.compile": "世界编译",
  "world.check": "世界检查",
};

export function agentStepName(step: string) {
  return STEP_NAMES[step] || step;
}

export function latestAgentRunMessage(events: AgentRunEvent[]) {
  const event = events.at(-1);
  if (!event) return "";
  if (event.type === "step.started") return `${agentStepName(event.step)}正在运行…`;
  if (event.type === "model.completed") {
    return `${agentStepName(event.step)}完成模型调用 · ${event.meta.model} · ${event.meta.latencyMs} ms`;
  }
  if (event.type === "tool.started") return `${agentStepName(event.step)}正在调用 ${event.tool}…`;
  if (event.type === "tool.completed") {
    return `${agentStepName(event.step)}完成 ${event.meta.tool} · ${event.meta.latencyMs} ms`;
  }
  if (event.type === "tool.failed") return `${agentStepName(event.step)}的 ${event.meta.tool} 调用失败，正在调整计划…`;
  if (event.type === "planner.decision") {
    return event.action === "continue"
      ? `${agentStepName(event.step)}已选择下一页证据…`
      : `${agentStepName(event.step)}决定提交当前证据。`;
  }
  if (event.type === "validation.failed") return `${agentStepName(event.step)}发现需要修复的数据…`;
  if (event.type === "step.retried") return `${agentStepName(event.step)}正在进行第 ${event.attempt} 次尝试…`;
  if (event.type === "step.completed") return `${agentStepName(event.step)}已完成。`;
  if (event.type === "run.completed") return "Agent 运行已完成。";
  if (event.type === "run.failed") return "Agent 运行失败，请查看错误信息。";
  return "";
}
