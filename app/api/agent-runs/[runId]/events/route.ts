import { NextResponse } from "next/server";
import { inMemoryTraceStore } from "@/lib/agent-runtime/in-memory-trace-store";
import { traceEventsToJsonl } from "@/lib/agent-runtime/trace-aggregation";

export const runtime = "edge";

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(runId)) {
    return NextResponse.json({ error: "无效的 Agent Run ID。" }, { status: 400 });
  }
  const format = new URL(request.url).searchParams.get("format");
  if (format && format !== "json" && format !== "jsonl") {
    return NextResponse.json({ error: "不支持的导出格式，仅支持 json 与 jsonl。" }, { status: 400 });
  }
  const run = inMemoryTraceStore.get(runId);
  if (!run) return NextResponse.json({ error: "Agent Run 尚未产生事件。" }, { status: 404 });
  if (format === "jsonl") {
    return new Response(traceEventsToJsonl(run.events), {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "content-disposition": `attachment; filename="agent-run-${runId}.jsonl"`,
        "cache-control": "no-store",
      },
    });
  }
  return NextResponse.json(run, {
    headers: { "cache-control": "no-store" },
  });
}
