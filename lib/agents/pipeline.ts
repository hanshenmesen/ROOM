import { checkWorld } from "./checker.ts";
import { directWorld } from "./creative-director.ts";
import { orchestrateWorld } from "./orchestrator.ts";
import { parseProfile, type ParseSource } from "./parser.ts";
import { normalizeDisplayProfile } from "../display-copy.ts";
import type { PipelineResult } from "../types.ts";

export function runPipeline(text: string, source?: ParseSource): PipelineResult {
  const profile = parseProfile(text, source);
  return compileProfile(profile);
}

export function compileProfile(profile: PipelineResult["profile"]): PipelineResult {
  const displayProfile = normalizeDisplayProfile(profile);
  const brief = directWorld(displayProfile);
  const world = orchestrateWorld(displayProfile, brief);
  const report = checkWorld(world);

  return {
    profile: displayProfile,
    brief,
    world,
    report,
    trace: [
      {
        id: "parser",
        name: "Claude Profile Agent",
        status: "complete",
        summary: `从来源中识别 ${displayProfile.items.length} 个内容条目与 ${displayProfile.skills.length} 项技能，并保留逐项证据。`,
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
