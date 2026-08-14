import type { AgentCallResult } from "../../agent-runtime/run-types.ts";
import type { AgentTracer } from "../../agent-runtime/tracer.ts";
import { PROFILE_AGENT_REQUEST_TIMEOUT_MS, type AgentRunControls } from "../../agent-runtime/run-controls.ts";
import { diagnosticDump, summarizeDiagnosticValue } from "../../agent-runtime/diagnostics.ts";
import { callModel, ModelServiceExhaustedError, type ModelServiceProvider } from "../model-service.ts";
import {
  DEFAULT_WEBSITE_AGENT_MODEL,
  getAgentProviderConfig,
  type AgentProviderOverride,
} from "../provider-config.ts";
import { externalMaasFallbackModel, externalMaasHostname } from "../provider-env.ts";
import { providerErrorDetail } from "../provider-errors.ts";
import { IDENTITY_DRAFT_SCHEMA, type ProfileDraftSchema } from "./schemas.ts";
import type { ExtractionShard, MaasContentBlock, ProfileAgentOptions } from "./types.ts";
import { ProfileAgentError } from "./types.ts";
import { cleanString } from "./utils.ts";
import { shardOutputErrors } from "./validation.ts";

// Output budgets leave enough room for complete dense Profile artifacts.
// DeepSeek extraction requests disable thinking below so reasoning cannot
// consume the artifact budget before the required tool call is emitted.
const IDENTITY_MAX_OUTPUT_TOKENS = 8_000;
const ITEMS_MAX_OUTPUT_TOKENS = 16_000;
const PROFILE_AGENT_EFFORT = "low";
// Per-request abort timeout, shared by every shard. A 120s cap was observed
// aborting healthy in-flight "items" shard calls (16k-token structured
// extraction through Xiaohongshu's internal MAAS gateway can legitimately
// take well past 120s), which then forced a retry that blew through the
// overall run budget. Rather than tune a fragile per-shard threshold against
// an unconfirmed P99, use one generous ceiling; DEFAULT_AGENT_RUN_BUDGET's
// maxDurationMs is sized to allow one slow attempt plus one full retry at
// this timeout.

function responseText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const message = choices[0] && typeof choices[0] === "object"
    ? (choices[0] as Record<string, unknown>).message
    : undefined;
  // OpenAI Chat Completions function calling (used by the internal-maas gateway):
  // tool_calls must be checked before content. On a tool-call response the
  // gateway sends content as an empty string (not null), so checking
  // content first would return "" and hide the real tool_calls payload.
  const toolCalls = message && typeof message === "object" && Array.isArray((message as Record<string, unknown>).tool_calls)
    ? (message as Record<string, unknown>).tool_calls as Array<Record<string, unknown>>
    : [];
  const toolArguments = toolCalls.map((call) => {
    const fn = call.function && typeof call.function === "object"
      ? call.function as Record<string, unknown>
      : undefined;
    return cleanString(fn?.arguments);
  }).filter(Boolean);
  if (toolArguments.length) return toolArguments.join("\n");
  const content = message && typeof message === "object"
    ? (message as Record<string, unknown>).content
    : undefined;
  if (typeof content === "string" && content) return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (!part || typeof part !== "object") return "";
      const block = part as Record<string, unknown>;
      if (block.input && typeof block.input === "object") return JSON.stringify(block.input);
      return cleanString(block.text);
    }).filter(Boolean).join("\n");
  }
  if (Array.isArray(record.content)) {
    return record.content.map((part) => {
      if (!part || typeof part !== "object") return "";
      const block = part as Record<string, unknown>;
      if (block.input && typeof block.input === "object") return JSON.stringify(block.input);
      return cleanString(block.text);
    }).filter(Boolean).join("\n");
  }
  return "";
}

function responseStopReason(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const choice = choices[0] && typeof choices[0] === "object" ? choices[0] as Record<string, unknown> : undefined;
  return cleanString(record.stop_reason) || cleanString(choice?.finish_reason);
}

function parseJsonOutput(output: string) {
  const trimmed = output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const value = JSON.parse(trimmed) as unknown;
    if (value && typeof value === "object" && typeof (value as Record<string, unknown>).draftJson === "string") {
      return JSON.parse((value as Record<string, string>).draftJson) as unknown;
    }
    return value;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const value = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
        if (value && typeof value === "object" && typeof (value as Record<string, unknown>).draftJson === "string") {
          return JSON.parse((value as Record<string, string>).draftJson) as unknown;
        }
        return value;
      } catch {
        // The bounded repair loop receives this failure as structured feedback.
      }
    }
    throw new ProfileAgentError("Agent 没有返回有效 JSON。", 502, ["invalid JSON response"]);
  }
}

function providerName(baseUrl: string) {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return "custom-provider";
  }
}

export async function callProfileModel<T>(input: {
  system: string;
  content: string | MaasContentBlock[];
  schema: ProfileDraftSchema;
  shard: ExtractionShard;
  minimumItems: number;
  providerScope: NonNullable<ProfileAgentOptions["providerScope"]>;
  providerOverride?: AgentProviderOverride;
  tracer: AgentTracer;
  attempt: number;
  promptVersion: string;
  step: string;
  runtimeControls: AgentRunControls;
}): Promise<AgentCallResult<T>> {
  const providerConfig = getAgentProviderConfig(input.providerOverride);
  const maasApiKeys = providerConfig.maas.apiKeys;
  const websiteApiKeys = providerConfig.website.apiKeys;
  if (!websiteApiKeys.length && !maasApiKeys.length) {
    throw new ProfileAgentError("服务端尚未配置 Profile Agent API key。", 503);
  }
  const externalGatewayFallback = externalMaasFallbackModel();
  const maasModels = [...new Set([
    providerConfig.maas.model,
    // The fallback is a second Claude route on the external MAAS gateway; it
    // is meaningless (and confusing) on any other provider host, and only
    // exists when the deployment configured one.
    ...(providerConfig.maas.mode === "json-schema"
      && externalGatewayFallback
      && providerName(providerConfig.maas.baseUrl) === externalMaasHostname()
      ? [externalGatewayFallback]
      : []),
  ])];
  const websiteProviders: ModelServiceProvider[] = websiteApiKeys.length ? [{
    baseUrl: providerConfig.website.baseUrl,
    apiKeys: websiteApiKeys,
    models: [providerConfig.website.model || DEFAULT_WEBSITE_AGENT_MODEL],
    mode: providerConfig.website.mode,
    protocol: providerConfig.website.protocol,
    userEmail: providerConfig.website.userEmail,
    authMode: providerConfig.website.authMode,
    appId: providerConfig.website.appId,
  }] : [];
  const maasProviders: ModelServiceProvider[] = maasApiKeys.length ? [{
    baseUrl: providerConfig.maas.baseUrl,
    apiKeys: maasApiKeys,
    models: maasModels,
    mode: providerConfig.maas.mode,
    protocol: providerConfig.maas.protocol,
    userEmail: providerConfig.maas.userEmail,
    authMode: providerConfig.maas.authMode,
    appId: providerConfig.maas.appId,
  }] : [];
  const providers = input.providerScope === "website"
    ? [...websiteProviders, ...maasProviders]
    : [...maasProviders, ...websiteProviders];
  const agent = input.providerScope === "website" ? "website-profile-agent" : "profile-agent";
  const maxOutputTokens = input.schema === IDENTITY_DRAFT_SCHEMA ? IDENTITY_MAX_OUTPUT_TOKENS : ITEMS_MAX_OUTPUT_TOKENS;

  try {
    return await callModel<T>({
      agent,
      shard: input.shard,
      step: input.step,
      promptVersion: input.promptVersion,
      templateId: `profile-${input.shard}`,
      adapterVersion: "provider-request.v1",
      logLabel: "profile-agent",
      system: input.system,
      userContent: input.content,
      providers,
      maxOutputTokens,
      toolName: "submit_profile_result",
      toolDescription: "Submit the complete evidence-backed profile extraction result.",
      toolSchema: input.schema,
      jsonSchemaEffort: PROFILE_AGENT_EFFORT,
      requestTimeoutMs: PROFILE_AGENT_REQUEST_TIMEOUT_MS,
      tracer: input.tracer,
      runtimeControls: input.runtimeControls,
      attempt: input.attempt,
      handleResponse: ({ payload, model, mode, providerLabel }) => {
        const output = responseText(payload);
        if (!output) {
          // A 200 with no extractable text usually means the provider
          // returned a shape responseText() doesn't recognize yet (e.g. a
          // thinking-only response, or content blocks in an unexpected
          // position). Dump the shape server-side (structural summary by
          // default) to diagnose it.
          diagnosticDump(`[profile-agent] empty response from ${providerLabel}/${model} (${mode}):`, payload);
          return { outcome: "retry", errorCode: "empty_response", diagnostic: summarizeDiagnosticValue(payload) };
        }
        try {
          const value = parseJsonOutput(output);
          const structuralErrors = shardOutputErrors(value, input.shard, input.minimumItems);
          if (!structuralErrors.length) return { outcome: "success", data: value as T };
          // The trace only stores the structural-error summary; dump the
          // parsed tool-call arguments server-side (structural summary by
          // default, raw only behind the diagnostics flag) so shape
          // mismatches can be diagnosed without guessing.
          diagnosticDump(`[profile-agent] invalid structure from ${providerLabel}/${model} (${mode}, ${input.shard}):`, value);
          return {
            outcome: "retry",
            errorCode: "invalid_structure",
            diagnostic: summarizeDiagnosticValue(value),
            detail: `${input.shard} 分片结构不完整 · model=${model} · mode=${mode} · ${structuralErrors.join("; ")}`,
          };
        } catch {
          const stopReason = responseStopReason(payload);
          const likelyTruncated = ["max_tokens", "length"].includes(stopReason) || !output.trimEnd().endsWith("}");
          return {
            outcome: "retry",
            errorCode: "invalid_json",
            detail: [
              `${input.shard} 分片返回了无效 JSON`,
              `model=${model}`,
              `mode=${mode}`,
              `chars=${output.length}`,
              stopReason ? `stop=${stopReason}` : "",
              likelyTruncated ? "likely_truncated=true" : "",
            ].filter(Boolean).join(" · "),
          };
        }
      },
    });
  } catch (error) {
    if (!(error instanceof ModelServiceExhaustedError)) throw error;

    if (!error.lastResult) {
      if (error.lastRequestError instanceof Error) {
        // A request-level failure here is almost always the per-request abort
        // timeout firing; surface it as a 504 with an actionable hint instead
        // of an opaque 502 wrapping a DOMException message.
        const timedOut = error.lastRequestError instanceof DOMException
          && ["TimeoutError", "AbortError"].includes(error.lastRequestError.name);
        throw new ProfileAgentError(
          timedOut
            ? "模型响应超时。该 Provider 当前响应过慢，请稍后重试，或在「配置解析服务」中切换 Provider。"
            : `Profile Agent 请求失败：${error.lastRequestError.message}`,
          timedOut ? 504 : 502,
        );
      }
      throw new ProfileAgentError("Provider 熔断保护中，本次请求未执行。请稍后重试。", 503);
    }
    const { response, payload } = error.lastResult;
    if (!response.ok) {
      const detail = providerErrorDetail(payload);
      // Classify provider failures so the user gets a next step instead of a
      // bare 502.
      if ([401, 403].includes(response.status)) {
        throw new ProfileAgentError(
          `Provider 拒绝了 API key（${response.status}）${detail ? `：${detail}` : ""}。请在「配置解析服务」中检查 key 是否正确、是否仍有权限。`,
          response.status,
        );
      }
      if (response.status === 429) {
        throw new ProfileAgentError("Provider 请求限流（429）。请稍后重试。", 429);
      }
      if (response.status >= 500) {
        throw new ProfileAgentError(
          `Provider 服务暂时不可用（${response.status}）。请稍后重试，或切换其他 Provider。`,
          503,
        );
      }
      throw new ProfileAgentError(`Profile Agent 请求失败（${response.status}）${detail ? `：${detail}` : ""}`, 502);
    }
    const invalidOutputDetails = error.retryOutcomes
      .filter((outcome) => outcome.errorCode === "invalid_structure" || outcome.errorCode === "invalid_json")
      .map((outcome) => outcome.detail)
      .filter((detail): detail is string => Boolean(detail));
    if (invalidOutputDetails.length) {
      throw new ProfileAgentError(
        "模型多次返回不完整的数据，自动重试后仍失败。请切换 Provider 重试，或精简输入内容。",
        502,
        invalidOutputDetails.slice(-4),
      );
    }
    const sawEmptyResponse = error.retryOutcomes.some((outcome) => outcome.errorCode === "empty_response");
    if (sawEmptyResponse) {
      throw new ProfileAgentError("模型返回了空内容，通常是 Provider 兼容性问题。请切换 Provider 重试。", 502);
    }
    throw new ProfileAgentError("Profile Agent 返回了空内容。", 502);
  }
}
