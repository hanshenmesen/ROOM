import { NextResponse } from "next/server";
import { WorkflowNotFoundError } from "@/lib/workflow/room-workflow";
import { getRoomWorkflowEngine } from "@/lib/workflow/singleton";

export const runtime = "edge";

/**
 * Reads the Artifact bodies a client needs to actually resume a Run's
 * result -- the public snapshot at GET /api/runs/:runId intentionally
 * excludes Artifact bodies (only type/version), so "completed → show the
 * generated Profile" and "waiting_for_review → render the full merge
 * report" both need this endpoint. There is no separate ownership check:
 * in this anonymous single-user deployment the unguessable `runId` itself
 * is the capability, matching every other Run route.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  if (!/^workflow-[a-zA-Z0-9-]{16,100}$/.test(runId)) {
    return NextResponse.json({ error: "Invalid Workflow Run ID." }, { status: 400 });
  }
  try {
    const engine = await getRoomWorkflowEngine();
    const state = await engine.getState(runId);
    return NextResponse.json({
      status: state.status,
      profile: state.artifacts.profile?.data,
      mergeReport: state.artifacts.mergeReport?.data,
      websiteResearch: state.artifacts.websiteResearch?.data.state,
      creativeBrief: state.artifacts.creativeBrief?.data,
      world: state.artifacts.world?.data,
      checkReport: state.artifacts.checkReport?.data,
    }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof WorkflowNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ error: "Unable to read Workflow Run result." }, { status: 500 });
  }
}
