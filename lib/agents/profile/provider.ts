import type { AgentCallMeta, AgentCallResult } from "../../agent-runtime/run-types.ts";
import type { AgentTracer } from "../../agent-runtime/tracer.ts";
import type { AgentRunControls } from "../../agent-runtime/run-controls.ts";
import {
  DEFAULT_WEBSITE_AGENT_MODEL,
  FALLBACK_MAAS_MODEL,
  getAgentProviderConfig,
  isDeepSeekProvider,
  type AgentProviderOverride,
} from "../provider-config.ts";
import { estimateCallCostUsd } from "../provider-pricing.ts";
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

function estimatedTokens(input: string | MaasContentBlock[]) {
  const characters = typeof input === "string"
    ? input.length
    : input.reduce((total, block) => total + (block.type === "text" ? block.text.length : 8_000), 0);
  return Math.max(1, Math.ceil(characters / 4));
}

function estimatedCost(baseUrlOrHost: string, inputTokens: number, outputTokens: number) {
  return estimateCallCostUsd(baseUrlOrHost, inputTokens, outputTokens);
}

function responseText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const message = choices[0] && typeof choices[0] === "object"
    ? (choices[0] as Record<string, unknown>).message
    : undefined;
  const content = message && typeof message === "object"
    ? (message as Record<string, unknown>).content
    : undefined;
  if (typeof content === "string") return content;
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

function responseUsage(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const usage = (payload as Record<string, unknown>).usage;
  if (!usage || typeof usage !== "object") return {};
  const record = usage as Record<string, unknown>;
  const inputTokens = Number(record.input_tokens ?? record.prompt_tokens);
  const outputTokens = Number(record.output_tokens ?? record.completion_tokens);
  return {
    ...(Number.isFinite(inputTokens) ? { inputTokens } : {}),
    ...(Number.isFinite(outputTokens) ? { outputTokens } : {}),
  };
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

function metaFor(input: {
  callId: string;
  agent: string;
  shard: ExtractionShard;
  provider: string;
  model: string;
  mode: "json-schema" | "tool";
  promptVersion: string;
  startedAt: string;
  startedMark: number;
  attempt: number;
  fallbackCount: number;
  payload?: unknown;
}): AgentCallMeta {
  const stopReason = responseStopReason(input.payload);
  const usage = responseUsage(input.payload);
  return {
    callId: input.callId,
    agent: input.agent,
    shard: input.shard,
    provider: input.provider,
    model: input.model,
    mode: input.mode,
    promptVersion: input.promptVersion,
    startedAt: input.startedAt,
    latencyMs: Math.max(0, Math.round(performance.now() - input.startedMark)),
    ...usage,
    ...(usage.inputTokens !== undefined || usage.outputTokens !== undefined ? {
      estimatedCost: Number(estimatedCost(input.provider, usage.inputTokens || 0, usage.outputTokens || 0).toFixed(6)),
    } : {}),
    attempt: input.attempt,
    fallbackCount: input.fallbackCount,
    ...(stopReason ? { stopReason } : {}),
  };
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
  const messagesBaseUrl = (baseUrl: string) => /\/v1$/i.test(baseUrl) ? baseUrl : `${baseUrl}/v1`;
  const maasModels = [...new Set([
    providerConfig.maas.model,
    // The Bedrock fallback is a second Claude route on the MAAS gateway; it
    // is meaningless (and confusing) on any other provider host.
    ...(providerConfig.maas.mode === "json-schema" && providerName(providerConfig.maas.baseUrl).endsWith("rednote.life")
      ? [FALLBACK_MAAS_MODEL]
      : []),
  ])];
  const websiteProviders = websiteApiKeys.length ? [{
    baseUrl: messagesBaseUrl(providerConfig.website.baseUrl),
    apiKeys: websiteApiKeys,
    models: [providerConfig.website.model || DEFAULT_WEBSITE_AGENT_MODEL],
    mode: providerConfig.website.mode,
  }] : [];
  const maasProviders = maasApiKeys.length ? [{
    baseUrl: messagesBaseUrl(providerConfig.maas.baseUrl),
    apiKeys: maasApiKeys,
    models: maasModels,
    mode: providerConfig.maas.mode,
  }] : [];
  const providers = input.providerScope === "website"
    ? [...websiteProviders, ...maasProviders]
    : [...maasProviders, ...websiteProviders];
  const agent = input.providerScope === "website" ? "website-profile-agent" : "profile-agent";
  let lastResult: { response: Response; payload: unknown } | undefined;
  let lastRequestError: unknown;
  let sawEmptyResponse = false;
  let fallbackCount = 0;
  const invalidOutputDetails: string[] = [];

  providerLoop: for (const provider of providers) {
    const providerLabel = providerName(provider.baseUrl);
    const deepSeek = isDeepSeekProvider(provider.baseUrl);
    if (input.runtimeControls.circuitBreaker.isOpen(providerLabel)) continue;
    // DeepSeek's Anthropic endpoint supports Tool Use but ignores the JSON
    // schema part of output_config. Retrying an empty Tool response through
    // json-schema only adds another slow request that cannot satisfy ROOM's
    // structured-output contract.
    const modes = deepSeek
      ? ["tool"] as const
      : provider.mode === "json-schema"
      ? ["json-schema", "tool"] as const
      : ["tool", "json-schema"] as const;
    for (const mode of modes) {
      for (const model of provider.models) {
        for (const apiKey of provider.apiKeys) {
          if (input.runtimeControls.circuitBreaker.isOpen(providerLabel)) continue providerLoop;
          const callId = `call-${crypto.randomUUID()}`;
          const startedAt = new Date().toISOString();
          const startedMark = performance.now();
          const maxOutputTokens = input.schema === IDENTITY_DRAFT_SCHEMA ? IDENTITY_MAX_OUTPUT_TOKENS : ITEMS_MAX_OUTPUT_TOKENS;
          const inputTokenEstimate = estimatedTokens(input.system) + estimatedTokens(input.content);
          input.runtimeControls.budget.reserve({
            inputTokens: inputTokenEstimate,
            outputTokens: maxOutputTokens,
            estimatedCostUsd: estimatedCost(provider.baseUrl, inputTokenEstimate, maxOutputTokens),
          });
          let result: { response: Response; payload: unknown };
          try {
            const response = await fetch(`${provider.baseUrl}/messages`, {
              method: "POST",
              headers: {
                authorization: `Bearer ${apiKey}`,
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
              },
              body: JSON.stringify({
                model,
                system: input.system,
                messages: [{ role: "user", content: input.content }],
                temperature: 0,
                max_tokens: maxOutputTokens,
                // DeepSeek V4 defaults to thinking. Dense website/profile
                // extraction can spend the full request window on reasoning
                // and return no final tool_use block. This task is extraction,
                // so disable thinking and reserve the output for the Artifact.
                ...(deepSeek ? { thinking: { type: "disabled" } } : {}),
                ...(mode === "tool" ? {
                  tools: [{
                    name: "submit_profile_result",
                    description: "Submit the complete evidence-backed profile extraction result.",
                    input_schema: input.schema,
                  }],
                  // `any` forces a tool call without naming the tool: with a
                  // single tool it is equivalent to pinning it, and DeepSeek's
                  // thinking mode rejects the named form ("Thinking mode does
                  // not support this tool_choice").
                  tool_choice: { type: "any" },
                } : {
                  output_config: {
                    effort: PROFILE_AGENT_EFFORT,
                    format: { type: "json_schema", schema: input.schema },
                  },
                }),
              }),
              signal: input.runtimeControls.requestSignal(120_000),
            });
            const payload = await response.json().catch(() => null) as unknown;
            result = { response, payload };
            lastResult = result;
          } catch (error) {
            lastRequestError = error;
            const meta = metaFor({
              callId, agent, shard: input.shard, provider: providerLabel, model, mode,
              promptVersion: input.promptVersion, startedAt, startedMark, attempt: input.attempt, fallbackCount,
            });
            input.tracer.emit({ type: "model.failed", step: input.step, meta, errorCode: "request_failed" });
            fallbackCount += 1;
            const failureCount = input.runtimeControls.circuitBreaker.recordFailure(providerLabel);
            if (input.runtimeControls.circuitBreaker.isOpen(providerLabel)) continue providerLoop;
            await input.runtimeControls.boundedBackoff(failureCount);
            continue;
          }

          const meta = metaFor({
            callId, agent, shard: input.shard, provider: providerLabel, model, mode,
            promptVersion: input.promptVersion, startedAt, startedMark, attempt: input.attempt, fallbackCount,
            payload: result.payload,
          });
          if (result.response.ok) {
            input.runtimeControls.circuitBreaker.recordSuccess(providerLabel);
            const output = responseText(result.payload);
            if (output) {
              try {
                const value = parseJsonOutput(output);
                const structuralErrors = shardOutputErrors(value, input.shard, input.minimumItems);
                if (!structuralErrors.length) {
                  input.tracer.emit({ type: "model.completed", step: input.step, meta });
                  return { data: value as T, meta };
                }
                invalidOutputDetails.push(`${input.shard} 分片结构不完整 · model=${model} · mode=${mode} · ${structuralErrors.join("; ")}`);
                input.tracer.emit({ type: "model.failed", step: input.step, meta, errorCode: "invalid_structure" });
              } catch {
                const stopReason = responseStopReason(result.payload);
                const likelyTruncated = ["max_tokens", "length"].includes(stopReason)
                  || !output.trimEnd().endsWith("}");
                invalidOutputDetails.push([
                  `${input.shard} 分片返回了无效 JSON`,
                  `model=${model}`,
                  `mode=${mode}`,
                  `chars=${output.length}`,
                  stopReason ? `stop=${stopReason}` : "",
                  likelyTruncated ? "likely_truncated=true" : "",
                ].filter(Boolean).join(" · "));
                input.tracer.emit({ type: "model.failed", step: input.step, meta, errorCode: "invalid_json" });
              }
              fallbackCount += 1;
              continue;
            }
            sawEmptyResponse = true;
            input.tracer.emit({ type: "model.failed", step: input.step, meta, errorCode: "empty_response" });
            // A 200 with no extractable text usually means the provider
            // returned a shape responseText() doesn't recognize yet (e.g. a
            // thinking-only response, or content blocks in an unexpected
            // position). Log the raw shape server-side to diagnose it.
            console.error(
              `[profile-agent] empty response from ${providerLabel}/${model} (${mode}):`,
              JSON.stringify(result.payload).slice(0, 2000),
            );
            fallbackCount += 1;
            continue;
          }
          input.tracer.emit({ type: "model.failed", step: input.step, meta, errorCode: `http_${result.response.status}` });
          if (result.response.status >= 400 && result.response.status < 500) {
            // Provider 4xx bodies carry the exact request-validation reason;
            // the trace deliberately stores only the status code, so log the
            // sanitized message server-side for diagnosis.
            console.error(
              `[profile-agent] ${result.response.status} from ${providerLabel}/${model}:`,
              providerErrorDetail(result.payload) || "(no message)",
            );
          }
          fallbackCount += 1;
          if ([401, 403].includes(result.response.status)) continue;
          if (result.response.status === 429 || result.response.status >= 500) {
            const failureCount = input.runtimeControls.circuitBreaker.recordFailure(providerLabel);
            if (input.runtimeControls.circuitBreaker.isOpen(providerLabel)) continue providerLoop;
            await input.runtimeControls.boundedBackoff(failureCount);
          }
          break;
        }
      }
    }
  }

  if (!lastResult) {
    if (lastRequestError instanceof Error) {
      throw new ProfileAgentError(`Profile Agent 请求失败：${lastRequestError.message}`, 502);
    }
    throw new ProfileAgentError("MAAS 请求未执行。", 502);
  }
  const { response, payload } = lastResult;
  if (!response.ok) {
    const detail = providerErrorDetail(payload);
    throw new ProfileAgentError(`Profile Agent 请求失败（${response.status}）${detail ? `：${detail}` : ""}`, 502);
  }
  if (invalidOutputDetails.length) {
    throw new ProfileAgentError("Agent 没有返回有效 JSON。", 502, invalidOutputDetails.slice(-4));
  }
  if (sawEmptyResponse) throw new ProfileAgentError("Profile Agent 提供方均返回空内容。", 502);
  throw new ProfileAgentError("Profile Agent 返回了空内容。", 502);
}
