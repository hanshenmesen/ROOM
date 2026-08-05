import { NextResponse } from "next/server";
import { inMemoryTraceStore } from "@/lib/agent-runtime/in-memory-trace-store";

export const runtime = "edge";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(runId)) {
    return NextResponse.json({ error: "无效的 Agent Run ID。" }, { status: 400 });
  }
  const run = inMemoryTraceStore.get(runId);
  if (!run) return NextResponse.json({ error: "Agent Run 尚未产生事件。" }, { status: 404 });
  return NextResponse.json(run, {
    headers: { "cache-control": "no-store" },
  });
}
