import { WorkflowNotFoundError } from "@/lib/workflow/room-workflow";
import { getRoomWorkflowEngine } from "@/lib/workflow/singleton";

export const runtime = "edge";

// Bounded so an abandoned client (one that never sends an abort, e.g. a
// dropped mobile connection) cannot hold an edge invocation open forever;
// the client's existing cursor-based GET /events poller (see
// events/route.ts) picks up wherever this stream left off.
const POLL_INTERVAL_MS = 500;
const MAX_STREAM_DURATION_MS = 5 * 60_000;

const TERMINAL_EVENT_TYPES = new Set(["run.completed", "run.failed", "run.cancelled"]);

/**
 * Incremental Server-Sent Events stream for one Run's events, layered on
 * top of the same `RoomWorkflowEngine.getEvents(runId, after)` cursor pull
 * `GET /api/runs/:runId/events` already exposes -- this route does not
 * duplicate any projection logic, it just polls that same method on the
 * server side and pushes each new event to the client instead of making
 * the client poll. If the stream drops (network blip, edge invocation
 * limit), the client transparently falls back to the existing cursor GET
 * using the last `id:` it received; there is exactly one source of truth
 * for "what happened in this Run" either way.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  if (!/^workflow-[a-zA-Z0-9-]{16,100}$/.test(runId)) {
    return new Response("Invalid Workflow Run ID.", { status: 400 });
  }
  const rawAfter = new URL(request.url).searchParams.get("after") || "0";
  if (!/^\d+$/.test(rawAfter)) return new Response("Invalid event cursor.", { status: 400 });
  let sequence = Number(rawAfter);
  if (!Number.isSafeInteger(sequence)) return new Response("Invalid event cursor.", { status: 400 });

  const engine = await getRoomWorkflowEngine();
  try {
    await engine.getEvents(runId, sequence);
  } catch (error) {
    if (error instanceof WorkflowNotFoundError) return new Response(error.message, { status: 404 });
    return new Response("Unable to read Workflow events.", { status: 500 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  request.signal.addEventListener("abort", () => {
    closed = true;
  }, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      controller.enqueue(encoder.encode(": connected\n\n"));
      while (!closed && Date.now() - startedAt < MAX_STREAM_DURATION_MS) {
        let events;
        try {
          events = await engine.getEvents(runId, sequence);
        } catch {
          break;
        }
        for (const event of events) {
          sequence = event.sequence;
          controller.enqueue(encoder.encode(`id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`));
        }
        if (events.some((event) => TERMINAL_EVENT_TYPES.has(event.type))) break;
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
      controller.close();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
