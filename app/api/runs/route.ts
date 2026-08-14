import { NextResponse } from "next/server";
import { publicWorkflowSnapshot } from "@/lib/workflow/public-snapshot";
import { WorkflowIdempotencyConflictError } from "@/lib/workflow/room-workflow";
import { getRoomWorkflowEngine } from "@/lib/workflow/singleton";
import { readRequestAgentProviderConfig } from "@/lib/agents/request-provider-config";
import { assertProviderConfigUsable, ProviderConfigError, resolveProviderConfig } from "@/lib/agents/provider-config";
import { createRoomRunContext } from "@/lib/agent-runtime/run-context";
import { resolveTraceStore } from "@/lib/agent-runtime/resolve-trace-store";
import { privacySafeRequestKey, tryAcquireConcurrencyLease } from "@/lib/agent-runtime/concurrency-limiter";
import { registerAgentRunSignal } from "@/lib/agent-runtime/run-cancellation";
import { validatePublicUrl } from "@/lib/public-web";
import { ProfileAgentError, type AgentAttachment } from "@/lib/agents/profile-agent";
import type { WorkflowSourceInput } from "@/lib/workflow/types";

export const runtime = "edge";

const MAX_SOURCE_BYTES = 1024 * 1024;
// Mirrors /api/parse's compatibility upload ceiling; the Run API accepts
// PDF/image sources so a page refresh mid-extraction can still recover.
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const IMAGE_MEDIA_TYPES = new Set<AgentAttachment["mediaType"]>([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

type CreateRunBody = {
  source?: {
    type?: "text" | "url";
    label?: string;
    text?: string;
  };
  autoStart?: boolean;
  idempotencyKey?: string;
  mode?: "deterministic" | "agent";
  followWebsite?: boolean;
  website?: string;
};

type ResolvedSource = {
  input: WorkflowSourceInput;
  autoStart: boolean;
  idempotencyKey?: string;
};

function validIdempotencyKey(value: string) {
  return /^[a-zA-Z0-9._:-]{8,128}$/.test(value);
}

function fileExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() || "";
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function resolveJsonSource(request: Request): Promise<ResolvedSource | NextResponse> {
  const body = await request.json() as CreateRunBody;
  const source = body.source;
  if (!source || !["text", "url"].includes(source.type || "") || typeof source.text !== "string") {
    return NextResponse.json({ error: "Workflow source must be text or a public URL." }, { status: 400 });
  }
  const sourceType = source.type === "url" ? "url" as const : "text" as const;
  if (sourceType === "text" && !source.text.trim()) {
    return NextResponse.json({ error: "Workflow text source must be non-empty." }, { status: 400 });
  }
  let sourceText = source.text;
  let label = source.label?.trim() || "Workflow text source";
  if (sourceType === "url") {
    try {
      sourceText = validatePublicUrl(source.text.trim()).href;
      label = source.label?.trim() || sourceText;
    } catch {
      return NextResponse.json({ error: "Workflow URL source must be a public HTTP(S) URL." }, { status: 400 });
    }
  }
  if (label.length > 200) return NextResponse.json({ error: "Workflow source label is too long." }, { status: 400 });
  if (new TextEncoder().encode(sourceText).byteLength > MAX_SOURCE_BYTES) {
    return NextResponse.json({ error: "Workflow text source cannot exceed 1 MB." }, { status: 413 });
  }
  const headerKey = request.headers.get("idempotency-key")?.trim();
  const idempotencyKey = headerKey || body.idempotencyKey?.trim();
  if (idempotencyKey && !validIdempotencyKey(idempotencyKey)) {
    return NextResponse.json({ error: "Invalid Idempotency Key." }, { status: 400 });
  }
  let explicitWebsite: string | undefined;
  if (typeof body.website === "string" && body.website.trim()) {
    try {
      explicitWebsite = validatePublicUrl(body.website.trim()).href;
    } catch {
      return NextResponse.json({ error: "请输入可公开访问的个人网站地址。" }, { status: 400 });
    }
  }
  return {
    input: {
      type: sourceType,
      label,
      text: sourceText,
      mode: body.mode || "deterministic",
      followWebsite: body.followWebsite !== false,
      ...(explicitWebsite ? { website: explicitWebsite } : {}),
    },
    autoStart: body.autoStart !== false,
    idempotencyKey,
  };
}

/**
 * PDF/image sources have no deterministic path (there is no LLM-free way to
 * read a file), so they always run in `mode: "agent"`. Keeping the upload
 * on the same POST /api/runs endpoint means the same create → save runId →
 * start recovery flow used for text/URL also covers file uploads: the
 * `prepare_source` node checkpoints the local file read/extraction so a
 * later failure retries without re-uploading the original file.
 */
async function resolveMultipartSource(request: Request): Promise<ResolvedSource | NextResponse> {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "请选择要解析的文件。" }, { status: 400 });
  if (!file.size) return NextResponse.json({ error: "上传的文件为空。" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "文件不能超过 15 MB。" }, { status: 413 });
  const extension = fileExtension(file.name);
  let type: "pdf" | "image";
  let mediaType: AgentAttachment["mediaType"];
  if (file.type === "application/pdf" || extension === "pdf") {
    type = "pdf";
    mediaType = "application/pdf";
  } else if (IMAGE_MEDIA_TYPES.has(file.type as AgentAttachment["mediaType"])) {
    type = "image";
    mediaType = file.type as AgentAttachment["mediaType"];
  } else {
    return NextResponse.json({
      error: "Run API 目前仅支持 PDF、JPG、PNG、GIF、WebP 文件；文本/网页数据文件请改用文本或 URL 来源。",
    }, { status: 415 });
  }
  const idempotencyHeader = request.headers.get("idempotency-key")?.trim();
  const idempotencyFormValue = form.get("idempotencyKey");
  const idempotencyKey = idempotencyHeader
    || (typeof idempotencyFormValue === "string" ? idempotencyFormValue.trim() : undefined);
  if (idempotencyKey && !validIdempotencyKey(idempotencyKey)) {
    return NextResponse.json({ error: "Invalid Idempotency Key." }, { status: 400 });
  }
  const explicitWebsiteValue = form.get("website");
  let explicitWebsite: string | undefined;
  if (typeof explicitWebsiteValue === "string" && explicitWebsiteValue.trim()) {
    try {
      explicitWebsite = validatePublicUrl(explicitWebsiteValue.trim()).href;
    } catch {
      return NextResponse.json({ error: "请输入可公开访问的个人网站地址。" }, { status: 400 });
    }
  }
  const data = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  return {
    input: {
      type,
      label: (file.name || "Uploaded file").slice(0, 200),
      text: "",
      attachment: { mediaType, data },
      mode: "agent",
      followWebsite: form.get("followWebsite") !== "false",
      ...(explicitWebsite ? { website: explicitWebsite } : {}),
    },
    autoStart: form.get("autoStart") !== "false",
    idempotencyKey,
  };
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    const resolved = contentType.includes("multipart/form-data")
      ? await resolveMultipartSource(request)
      : await resolveJsonSource(request);
    if (resolved instanceof NextResponse) return resolved;
    const { input, autoStart, idempotencyKey } = resolved;

    const engine = await getRoomWorkflowEngine();
    const agentMode = input.mode === "agent";
    const providerConfig = agentMode ? await readRequestAgentProviderConfig(request) : undefined;
    if (agentMode) {
      // Fail loud before a Run record even exists: a misconfigured provider
      // (no usable API key, an unparsable baseUrl, an internal-maas slot
      // missing api-key auth) previously only surfaced as a 503 deep inside
      // the first model call, or -- for Workflow node handlers, which catch
      // failures into `state.failure` instead of rejecting -- as a
      // successful 201 response wrapping a Run that is already `"failed"`.
      try {
        assertProviderConfigUsable(resolveProviderConfig(providerConfig));
      } catch (error) {
        if (error instanceof ProviderConfigError) {
          return NextResponse.json({ error: `Provider 配置不可用：${error.message}` }, { status: 400 });
        }
        throw error;
      }
    }
    const requestKey = agentMode ? await privacySafeRequestKey(request) : "";
    const releaseLease = agentMode ? tryAcquireConcurrencyLease(`workflow:${requestKey}`, 2) : () => {};
    if (!releaseLease) {
      return NextResponse.json({ error: "当前 Agent 任务较多，请稍后重试。" }, {
        status: 429,
        headers: { "retry-after": "3" },
      });
    }
    try {
      const result = await engine.start(input, {
        idempotencyKey,
        autoRun: false,
      });
      let state = result.state;
      if (autoStart && !result.reused) {
        const registration = registerAgentRunSignal(result.runId, request.signal);
        try {
          state = await engine.run(result.runId, agentMode ? {
            context: createRoomRunContext({
              runId: result.runId,
              providerConfig,
              signal: registration.signal,
              traceStore: await resolveTraceStore(),
            }),
          } : undefined);
        } finally {
          registration.unregister();
        }
      }
      return NextResponse.json({
        reused: result.reused,
        run: publicWorkflowSnapshot(state, engine.persistence),
        ...(agentMode && !result.reused && autoStart ? {
          result: {
            profile: state.artifacts.profile?.data,
            mergeReport: state.artifacts.mergeReport?.data,
            websiteResearch: state.artifacts.websiteResearch?.data.state,
          },
        } : {}),
      }, {
        status: result.reused ? 200 : 201,
        headers: { "cache-control": "no-store" },
      });
    } finally {
      releaseLease();
    }
  } catch (error) {
    if (error instanceof WorkflowIdempotencyConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const status = error instanceof ProfileAgentError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create Workflow Run." }, { status });
  }
}
