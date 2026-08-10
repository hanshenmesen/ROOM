import { NextResponse } from "next/server";
import { publicWorkflowSnapshot } from "@/lib/workflow/public-snapshot";
import { WorkflowIdempotencyConflictError } from "@/lib/workflow/room-workflow";
import { getRoomWorkflowEngine } from "@/lib/workflow/singleton";

export const runtime = "edge";

const MAX_SOURCE_BYTES = 1024 * 1024;

type CreateRunBody = {
  source?: {
    type?: "text";
    label?: string;
    text?: string;
  };
  autoStart?: boolean;
  idempotencyKey?: string;
};

function validIdempotencyKey(value: string) {
  return /^[a-zA-Z0-9._:-]{8,128}$/.test(value);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as CreateRunBody;
    const source = body.source;
    if (source?.type !== "text" || typeof source.text !== "string" || !source.text.trim()) {
      return NextResponse.json({ error: "Workflow source must be non-empty text." }, { status: 400 });
    }
    const label = source.label?.trim() || "Workflow text source";
    if (label.length > 200) return NextResponse.json({ error: "Workflow source label is too long." }, { status: 400 });
    if (new TextEncoder().encode(source.text).byteLength > MAX_SOURCE_BYTES) {
      return NextResponse.json({ error: "Workflow text source cannot exceed 1 MB." }, { status: 413 });
    }
    const headerKey = request.headers.get("idempotency-key")?.trim();
    const idempotencyKey = headerKey || body.idempotencyKey?.trim();
    if (idempotencyKey && !validIdempotencyKey(idempotencyKey)) {
      return NextResponse.json({ error: "Invalid Idempotency Key." }, { status: 400 });
    }
    const engine = await getRoomWorkflowEngine();
    const result = await engine.start({
      type: "text",
      label,
      text: source.text,
    }, {
      idempotencyKey,
      autoRun: body.autoStart !== false,
    });
    return NextResponse.json({
      reused: result.reused,
      run: publicWorkflowSnapshot(result.state, engine.persistence),
    }, {
      status: result.reused ? 200 : 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof WorkflowIdempotencyConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create Workflow Run." }, { status: 500 });
  }
}
