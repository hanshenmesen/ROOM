import { NextResponse } from "next/server";
import { publicWorkflowSnapshot } from "@/lib/workflow/public-snapshot";
import { WorkflowNotFoundError, WorkflowTransitionError } from "@/lib/workflow/room-workflow";
import { getRoomWorkflowEngine } from "@/lib/workflow/singleton";

export const runtime = "edge";

export async function POST(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  if (!/^workflow-[a-zA-Z0-9-]{16,100}$/.test(runId)) {
    return NextResponse.json({ error: "Invalid Workflow Run ID." }, { status: 400 });
  }
  try {
    const engine = await getRoomWorkflowEngine();
    return NextResponse.json({ run: publicWorkflowSnapshot(await engine.cancel(runId), engine.persistence) }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof WorkflowNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof WorkflowTransitionError) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: "Unable to cancel Workflow Run." }, { status: 500 });
  }
}
