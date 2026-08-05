import type { AgentRunEvent } from "../agent-runtime/run-types.ts";
import type { ParsedProfile } from "../types.ts";

function canonical(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function titleRecall(profile: ParsedProfile, expectedTitles: string[]) {
  if (!expectedTitles.length) return 1;
  const actual = new Set(profile.items.map((item) => canonical(item.title)));
  return expectedTitles.filter((title) => actual.has(canonical(title))).length / expectedTitles.length;
}

export function compareWebsiteResearch(input: {
  expectedTitles: string[];
  singlePageProfile: ParsedProfile;
  researchProfile: ParsedProfile;
  researchEvents?: AgentRunEvent[];
  visitedPages: number;
  downloadedBytes: number;
}) {
  const singlePageRecall = titleRecall(input.singlePageProfile, input.expectedTitles);
  const toolAgentRecall = titleRecall(input.researchProfile, input.expectedTitles);
  const toolEvents = (input.researchEvents || []).filter(
    (event) => event.type === "tool.completed" || event.type === "tool.failed",
  );
  const modelEvents = (input.researchEvents || []).filter(
    (event) => event.type === "model.completed" || event.type === "model.failed",
  );
  return {
    schemaVersion: "website-research-comparison.v1" as const,
    singlePageRecall,
    toolAgentRecall,
    recallDelta: toolAgentRecall - singlePageRecall,
    visitedPages: input.visitedPages,
    downloadedBytes: input.downloadedBytes,
    toolCalls: toolEvents.length,
    toolLatencyMs: toolEvents.reduce((total, event) => total + event.meta.latencyMs, 0),
    modelCalls: modelEvents.length,
    inputTokens: modelEvents.length && modelEvents.every((event) => event.meta.inputTokens !== undefined)
      ? modelEvents.reduce((total, event) => total + (event.meta.inputTokens || 0), 0)
      : null,
    outputTokens: modelEvents.length && modelEvents.every((event) => event.meta.outputTokens !== undefined)
      ? modelEvents.reduce((total, event) => total + (event.meta.outputTokens || 0), 0)
      : null,
  };
}
