import { checkWorld } from "./checker.ts";
import { directWorld } from "./creative-director.ts";
import { orchestrateWorld } from "./orchestrator.ts";
import { parseProfile, type ParseSource } from "./parser.ts";
import type { PipelineResult } from "../types.ts";

export function runPipeline(text: string, source?: ParseSource): PipelineResult {
  const profile = parseProfile(text, source);
  const brief = directWorld(profile);
  const world = orchestrateWorld(profile, brief);
  const report = checkWorld(world);

  return {
    profile,
    brief,
    world,
    report,
    trace: [
      {
        id: "parser",
        name: "Parser Agent",
        status: "complete",
        summary: `从 ${profile.source.lineCount} 行来源中识别 ${profile.items.length} 个内容条目与 ${profile.skills.length} 项技能。`,
        artifacts: ["profile.json", "source-evidence[]"],
      },
      {
        id: "director",
        name: "Creative Director",
        status: "complete",
        summary: `从许可分层参考库检索 ${brief.references.length} 个模式，产出连续建筑式多房间创意简报。`,
        artifacts: ["creative-brief.json", "retrieval-trace.json"],
      },
      {
        id: "orchestrator",
        name: "World Orchestrator",
        status: "complete",
        summary: `生成 ${world.rooms.length} 个连通房间和 ${world.exhibits.length} 件一一映射展品。`,
        artifacts: ["world-plan.json", "content-map.json"],
      },
      {
        id: "checker",
        name: "World Checker",
        status: report.passed ? (report.issues.length ? "warning" : "complete") : "failed",
        summary: `${report.score}/100 · ${report.summary}`,
        artifacts: ["check-report.json"],
      },
    ],
  };
}
