import { snapshotFromEvents, summarizeAgentRun } from "../agent-runtime/trace-summary.ts";
import { createAgentTracer, type AgentTracer } from "../agent-runtime/tracer.ts";
import type { AgentRunEvent } from "../agent-runtime/run-types.ts";
import { normalizeDisplayProfile } from "../display-copy.ts";
import type { PipelineResult } from "../types.ts";
import { checkWorld } from "./checker.ts";
import { directWorld } from "./creative-director.ts";
import { orchestrateWorld } from "./orchestrator.ts";
import { parseProfile, type ParseSource } from "./parser.ts";

type CompileProfileOptions = {
  tracer?: AgentTracer;
  priorEvents?: AgentRunEvent[];
  completeRun?: boolean;
};

export function runPipeline(text: string, source?: ParseSource): PipelineResult {
  const tracer = createAgentTracer();
  tracer.emit({ type: "step.started", step: "profile.parse", attempt: 1 });
  const profile = parseProfile(text, source);
  tracer.emit({ type: "artifact.created", step: "profile.parse", name: "profile.json", schemaVersion: "profile.v1" });
  tracer.emit({ type: "step.completed", step: "profile.parse" });
  return compileProfile(profile, { tracer, completeRun: true });
}

export function compileProfile(
  profile: PipelineResult["profile"],
  options: CompileProfileOptions = {},
): PipelineResult {
  const ownsTracer = !options.tracer;
  const tracer = options.tracer || createAgentTracer();
  tracer.start();

  tracer.emit({ type: "step.started", step: "creative.retrieve", attempt: 1 });
  const displayProfile = normalizeDisplayProfile(profile);
  const brief = directWorld(displayProfile);
  tracer.emit({ type: "artifact.created", step: "creative.retrieve", name: "creative-brief.json", schemaVersion: "creative-brief.v1" });
  tracer.emit({ type: "step.completed", step: "creative.retrieve" });

  tracer.emit({ type: "step.started", step: "world.compile", attempt: 1 });
  const world = orchestrateWorld(displayProfile, brief);
  tracer.emit({ type: "artifact.created", step: "world.compile", name: "world-plan.json", schemaVersion: "world.v1" });
  tracer.emit({ type: "step.completed", step: "world.compile" });

  tracer.emit({ type: "step.started", step: "world.check", attempt: 1 });
  const report = checkWorld(world);
  if (!report.passed || report.issues.length) {
    tracer.emit({
      type: "validation.failed",
      step: "world.check",
      errors: report.issues.map((issue) => `${issue.category}:${issue.severity}`),
    });
  }
  tracer.emit({ type: "artifact.created", step: "world.check", name: "check-report.json", schemaVersion: "check-report.v1" });
  tracer.emit({ type: "step.completed", step: "world.check" });

  if (ownsTracer || options.completeRun) tracer.complete();
  const localSnapshot = tracer.snapshot()!;
  const priorEvents = (options.priorEvents || []).filter(
    (event) => !["run.started", "run.completed", "run.failed"].includes(event.type),
  );
  const events = [...priorEvents, ...localSnapshot.events];
  const run = snapshotFromEvents(localSnapshot.runId, events);

  return {
    profile: displayProfile,
    brief,
    world,
    report,
    trace: summarizeAgentRun(events),
    run,
  };
}
