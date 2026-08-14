import { NextResponse } from "next/server";
import { publicWorkflowSnapshot } from "@/lib/workflow/public-snapshot";
import { WorkflowNotFoundError, WorkflowTransitionError } from "@/lib/workflow/room-workflow";
import { getRoomWorkflowEngine } from "@/lib/workflow/singleton";
import { readRequestAgentProviderConfig } from "@/lib/agents/request-provider-config";
import { createRoomRunContext } from "@/lib/agent-runtime/run-context";
import { resolveTraceStore } from "@/lib/agent-runtime/resolve-trace-store";
import { registerAgentRunSignal } from "@/lib/agent-runtime/run-cancellation";
import { privacySafeRequestKey, tryAcquireConcurrencyLease } from "@/lib/agent-runtime/concurrency-limiter";

export const runtime = "edge";

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  if (!/^workflow-[a-zA-Z0-9-]{16,100}$/.test(runId)) {
    return NextResponse.json({ error: "Invalid Workflow Run ID." }, { status: 400 });
  }
  try {
    const requestKey = await privacySafeRequestKey(request);
    const releaseLease = tryAcquireConcurrencyLease(`workflow:${requestKey}`, 2);
    if (!releaseLease) {
      return NextResponse.json({ error: "当前 Agent 任务较多，请稍后重试。" }, {
        status: 429,
        headers: { "retry-after": "3" },
      });
    }
    try {
      const engine = await getRoomWorkflowEngine();
      const providerConfig = await readRequestAgentProviderConfig(request);
      const registration = registerAgentRunSignal(runId, request.signal);
      const state = await engine.resume(runId, {
        context: createRoomRunContext({
          runId, providerConfig, signal: registration.signal, traceStore: await resolveTraceStore(),
        }),
      }).finally(registration.unregister);
      return NextResponse.json({ run: publicWorkflowSnapshot(state, engine.persistence) }, {
        headers: { "cache-control": "no-store" },
      });
    } finally {
      releaseLease();
    }
  } catch (error) {
    if (error instanceof WorkflowNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof WorkflowTransitionError) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: "Unable to resume Workflow Run." }, { status: 500 });
  }
}
