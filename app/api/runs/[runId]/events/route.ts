import { NextResponse } from "next/server";
import { WorkflowNotFoundError } from "@/lib/workflow/room-workflow";
import { roomWorkflowEngine } from "@/lib/workflow/singleton";

export const runtime = "edge";

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  if (!/^workflow-[a-zA-Z0-9-]{16,100}$/.test(runId)) {
    return NextResponse.json({ error: "Invalid Workflow Run ID." }, { status: 400 });
  }
  const rawAfter = new URL(request.url).searchParams.get("after") || "0";
  if (!/^\d+$/.test(rawAfter)) return NextResponse.json({ error: "Invalid event cursor." }, { status: 400 });
  const after = Number(rawAfter);
  if (!Number.isSafeInteger(after)) return NextResponse.json({ error: "Invalid event cursor." }, { status: 400 });
  try {
    const events = await roomWorkflowEngine.getEvents(runId, after);
    return NextResponse.json({
      runId,
      events,
      nextSequence: events.at(-1)?.sequence || after,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof WorkflowNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "Unable to read Workflow events." }, { status: 500 });
  }
}
