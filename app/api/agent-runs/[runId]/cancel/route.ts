import { NextResponse } from "next/server";
import { cancelAgentRunById } from "@/lib/agent-runtime/run-cancellation";

export const runtime = "edge";

/**
 * Cancels an in-flight Agent run: aborts its model calls so the run ends
 * immediately and its concurrency lease is released, instead of letting it
 * run until the request timeout while the user has already walked away.
 * 404 when the run already finished (or never started in this process).
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(runId)) {
    return NextResponse.json({ error: "无效的 Agent Run ID。" }, { status: 400 });
  }
  const cancelled = cancelAgentRunById(runId);
  return NextResponse.json({ ok: cancelled }, { status: cancelled ? 200 : 404 });
}
