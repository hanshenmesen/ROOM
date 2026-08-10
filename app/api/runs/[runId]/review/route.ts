import { NextResponse } from "next/server";
import type { ProfileReviewResolution } from "@/lib/profile-merge";
import { publicWorkflowSnapshot } from "@/lib/workflow/public-snapshot";
import { WorkflowNotFoundError, WorkflowTransitionError } from "@/lib/workflow/room-workflow";
import { getRoomWorkflowEngine } from "@/lib/workflow/singleton";

export const runtime = "edge";

const ACTIONS = new Set(["primary", "supplement", "edit", "reject"]);

function validResolutions(value: unknown): value is ProfileReviewResolution[] {
  if (!Array.isArray(value) || !value.length || value.length > 100) return false;
  return value.every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.conflictId !== "string" || !/^conflict-[a-zA-Z0-9_-]{1,240}$/.test(candidate.conflictId)) return false;
    if (typeof candidate.action !== "string" || !ACTIONS.has(candidate.action)) return false;
    if (candidate.value === undefined) return candidate.action !== "edit";
    if (candidate.action !== "edit") return false;
    if (typeof candidate.value === "string") return candidate.value.trim().length > 0 && candidate.value.length <= 5_000;
    return Array.isArray(candidate.value)
      && candidate.value.length > 0
      && candidate.value.length <= 100
      && candidate.value.every((part) => typeof part === "string" && part.trim().length > 0 && part.length <= 500);
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  if (!/^workflow-[a-zA-Z0-9-]{16,100}$/.test(runId)) {
    return NextResponse.json({ error: "Invalid Workflow Run ID." }, { status: 400 });
  }
  try {
    const body = await request.json() as { resolutions?: unknown };
    if (!validResolutions(body.resolutions)) {
      return NextResponse.json({ error: "Invalid Profile Review resolutions." }, { status: 400 });
    }
    const engine = await getRoomWorkflowEngine();
    return NextResponse.json({ run: publicWorkflowSnapshot(await engine.review(runId, body.resolutions), engine.persistence) }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    if (error instanceof WorkflowNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof WorkflowTransitionError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof Error && /冲突|字段|候选值|Profile/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return NextResponse.json({ error: "Unable to apply Workflow review." }, { status: 500 });
  }
}
