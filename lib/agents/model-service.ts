import { newCallId } from "../ids.ts";
import { sha256Hex } from "../agent-runtime/content-hash.ts";
import type { DiagnosticNode } from "../agent-runtime/diagnostics.ts";
import { AgentRunControls } from "../agent-runtime/run-controls.ts";
import type { AgentCallInputRef, AgentCallMeta, AgentCallResult } from "../agent-runtime/run-types.ts";
import type { AgentTracer } from "../agent-runtime/tracer.ts";
import { providerCapabilitiesFor, routeProviderModes } from "./provider-capabilities.ts";
import { isDeepSeekProvider } from "./provider-config.ts";
import { estimateCallCostUsd } from "./provider-pricing.ts";
import { providerErrorDetail } from "./provider-errors.ts";
import { buildToolCallRequest, type ProviderAuthMode, type ProviderProtocol } from "./provider-request.ts";
import type { MaasContentBlock } from "./profile/types.ts";

/**
 * One provider slot's dial-in for `ModelService.call()`: a host, its
 * candidate models (tried in order), and the credentials/mode to request
 * with. This is the same shape `getAgentProviderConfig()`'s slots already
 * have (`{ baseUrl, apiKeys, model(s), mode, protocol, ... }`), so call
 * sites build it directly from provider config without an adapter layer.
 */
export type ModelServiceProvider = {
  baseUrl: string;
  apiKeys: string[];
  models: string[];
  mode: "json-schema" | "tool";
  protocol: ProviderProtocol;
  userEmail?: string;
  authMode?: ProviderAuthMode;
  appId?: string;
};

export type ModelServiceOutcome<T> =
  | { outcome: "success"; data: T }
  /**
   * The response was well-formed HTTP-wise but not a usable result (invalid
   * JSON, a structurally incomplete draft, an empty response body, ...).
   * Treated exactly like an HTTP failure: the loop advances to the next
   * apiKey/model/mode/provider candidate instead of retrying the same one.
   */
  | { outcome: "retry"; errorCode: string; diagnostic?: DiagnosticNode; detail?: string };

export type ModelServiceCallInput<T> = {
  /** Trace `AgentCallMeta.agent` -- e.g. "profile-agent", "website-research-planner". */
  agent: string;
  shard?: string;
  /** Trace step name model.* events are attached to. */
  step: string;
  promptVersion: string;
  /** Console warning prefix for 4xx bodies, e.g. "profile-agent". */
  logLabel: string;
  system: string;
  userContent: string | MaasContentBlock[];
  /** Tried in order; each provider's own models/apiKeys/modes are tried in nested order (mode > model > apiKey). */
  providers: ModelServiceProvider[];
  maxOutputTokens: number;
  temperature?: number;
  toolName: string;
  toolDescription: string;
  toolSchema: Record<string, unknown>;
  jsonSchemaEffort?: "low" | "high" | "max";
  requestTimeoutMs: number;
  /** Omit for call sites that don't participate in Run tracing (e.g. pet QA, a per-question chat call with no Run scope). */
  tracer?: AgentTracer;
  runtimeControls: AgentRunControls;
  attempt?: number;
  /** Identifies the prompt template that produced `system`/`userContent`, for reproducibility (see `AgentCallMeta.templateId`). */
  templateId?: string;
  /** Identifies the request-building adapter version (currently always `buildToolCallRequest`'s module), for reproducibility. */
  adapterVersion?: string;
  /** Non-sensitive references to the Artifacts/content that produced `userContent` (see `AgentCallMeta.inputRefs`). Content itself is never recorded; only type/version/hash. */
  inputRefs?: AgentCallInputRef[];
  /**
   * Interprets one successful (HTTP 2xx) response payload into a domain
   * value. This is the one part of the old per-consumer provider loops that
   * genuinely differs between callers (profile shard structural validation,
   * the planner's decision JSON, pet QA's citation-checked answer) and
   * stays owned by the caller; everything else (iteration order, budget
   * reservation, circuit breaking, backoff, trace emission) is common and
   * lives here.
   */
  handleResponse: (input: {
    payload: unknown;
    response: Response;
    model: string;
    mode: "json-schema" | "tool";
    providerLabel: string;
  }) => ModelServiceOutcome<T>;
};

export type ModelServiceRetryOutcome = { errorCode: string; detail?: string };

/**
 * Thrown when every provider/mode/model/apiKey candidate was exhausted
 * without a usable result. Carries the same raw failure context the old
 * per-consumer loops used to build their final user-facing error message,
 * so callers keep their exact existing error classification (401 vs 429 vs
 * 5xx vs empty response vs invalid structure) without ModelService having
 * to know about any of it:
 *
 * - `lastResult`/`lastRequestError`: the last HTTP round-trip (of either
 *   outcome) and the last request-level exception, for callers that
 *   classify by the terminal failure (e.g. the profile agent's status-code
 *   priority order).
 * - `retryOutcomes`: every `{ outcome: "retry" }` `handleResponse` returned,
 *   in order, for callers that need to distinguish *why* responses were
 *   rejected across every attempt (not just the last one) -- e.g.
 *   "structurally incomplete" vs "empty" bodies get different messages.
 * - `lastError`: a single generic Error reflecting whichever failure
 *   happened last, for callers (the website planner) that only ever
 *   propagated "the last thing that went wrong" and don't need the above.
 */
export class ModelServiceExhaustedError extends Error {
  readonly lastResult?: { response: Response; payload: unknown };
  readonly lastRequestError?: unknown;
  readonly retryOutcomes: ModelServiceRetryOutcome[];
  readonly lastError: Error;

  constructor(input: {
    lastResult?: { response: Response; payload: unknown };
    lastRequestError?: unknown;
    retryOutcomes: ModelServiceRetryOutcome[];
    lastError: Error;
  }) {
    super("Model service exhausted every provider candidate.");
    this.name = "ModelServiceExhaustedError";
    this.lastResult = input.lastResult;
    this.lastRequestError = input.lastRequestError;
    this.retryOutcomes = input.retryOutcomes;
    this.lastError = input.lastError;
  }
}

function estimatedTokens(input: string | MaasContentBlock[]) {
  const characters = typeof input === "string"
    ? input.length
    : input.reduce((total, block) => total + (block.type === "text" ? block.text.length : 8_000), 0);
  return Math.max(1, Math.ceil(characters / 4));
}

function providerName(baseUrl: string) {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return "custom-provider";
  }
}

function responseStopReason(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const choice = choices[0] && typeof choices[0] === "object" ? choices[0] as Record<string, unknown> : undefined;
  const reason = record.stop_reason ?? choice?.finish_reason;
  return typeof reason === "string" ? reason.slice(0, 100) : undefined;
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

function metaFor(input: {
  callId: string;
  agent: string;
  shard?: string;
  provider: string;
  model: string;
  mode: "json-schema" | "tool";
  promptVersion: string;
  startedAt: string;
  startedMark: number;
  attempt: number;
  fallbackCount: number;
  payload?: unknown;
  templateId?: string;
  adapterVersion?: string;
  inputRefs?: AgentCallInputRef[];
  contentHash?: string;
}): AgentCallMeta {
  const usage = responseUsage(input.payload);
  const stopReason = responseStopReason(input.payload);
  return {
    callId: input.callId,
    agent: input.agent,
    ...(input.shard ? { shard: input.shard } : {}),
    provider: input.provider,
    model: input.model,
    mode: input.mode,
    promptVersion: input.promptVersion,
    startedAt: input.startedAt,
    latencyMs: Math.max(0, Math.round(performance.now() - input.startedMark)),
    ...usage,
    ...(usage.inputTokens !== undefined || usage.outputTokens !== undefined ? {
      estimatedCost: Number(estimateCallCostUsd(input.provider, usage.inputTokens || 0, usage.outputTokens || 0).toFixed(6)),
    } : {}),
    attempt: input.attempt,
    fallbackCount: input.fallbackCount,
    ...(stopReason ? { stopReason } : {}),
    ...(input.templateId ? { templateId: input.templateId } : {}),
    ...(input.adapterVersion ? { adapterVersion: input.adapterVersion } : {}),
    ...(input.inputRefs ? { inputRefs: input.inputRefs } : {}),
    ...(input.contentHash ? { contentHash: input.contentHash } : {}),
  };
}

/**
 * The one provider/mode/model/apiKey iteration loop for every ROOM model
 * call site (profile shards, website planner, pet QA). Owns budget
 * reservation, per-provider circuit breaking, bounded backoff on
 * retryable failures, and `model.completed`/`model.failed` trace emission;
 * delegates response interpretation to `handleResponse`.
 *
 * Iteration order matches the richest of the three call sites this
 * replaces (the profile agent's provider): for each provider, for each
 * structured-output mode (see `routeProviderModes`), for each model, for
 * each apiKey. A 401/403 tries the next apiKey; a 429 or 5xx records a
 * circuit-breaker failure (skipping straight to the next provider once the
 * breaker opens) and backs off before moving to the next model; any other
 * failure (including a `{ outcome: "retry" }` from `handleResponse`) moves
 * straight to the next candidate.
 */
export async function callModel<T>(input: ModelServiceCallInput<T>): Promise<AgentCallResult<T>> {
  const attempt = input.attempt || 1;
  const retryOutcomes: ModelServiceRetryOutcome[] = [];
  let lastResult: { response: Response; payload: unknown } | undefined;
  let lastRequestError: unknown;
  let lastError: Error = new Error("Model service exhausted every provider candidate.");
  let fallbackCount = 0;
  // Computed once (identical for every candidate attempt): the exact
  // `userContent` sent, hashed instead of recorded, so a trace can confirm
  // "this Run's call and that Run's call saw byte-identical input" without
  // ever persisting the (potentially PII-bearing) content itself.
  const contentHash = await sha256Hex(
    typeof input.userContent === "string" ? input.userContent : JSON.stringify(input.userContent),
  );

  providerLoop: for (const provider of input.providers) {
    const providerLabel = providerName(provider.baseUrl);
    if (input.runtimeControls.circuitBreaker.isOpen(providerLabel)) continue;
    const deepSeek = isDeepSeekProvider(provider.baseUrl);
    const modes = routeProviderModes({ protocol: provider.protocol, mode: provider.mode, deepSeek });
    for (const mode of modes) {
      for (const model of provider.models) {
        for (const apiKey of provider.apiKeys) {
          if (input.runtimeControls.circuitBreaker.isOpen(providerLabel)) continue providerLoop;
          const callId = newCallId();
          const startedAt = new Date().toISOString();
          const startedMark = performance.now();
          const inputTokenEstimate = estimatedTokens(input.system) + estimatedTokens(input.userContent);
          await input.runtimeControls.reserve({
            inputTokens: inputTokenEstimate,
            outputTokens: input.maxOutputTokens,
            estimatedCostUsd: estimateCallCostUsd(provider.baseUrl, inputTokenEstimate, input.maxOutputTokens),
          });

          let result: { response: Response; payload: unknown };
          try {
            const request = buildToolCallRequest({
              protocol: provider.protocol,
              baseUrl: provider.baseUrl,
              apiKey,
              userEmail: provider.userEmail,
              authMode: provider.authMode,
              appId: provider.appId,
              model,
              system: input.system,
              userContent: input.userContent,
              temperature: input.temperature ?? 0,
              maxOutputTokens: input.maxOutputTokens,
              toolName: input.toolName,
              toolDescription: input.toolDescription,
              toolSchema: input.toolSchema,
              jsonSchemaMode: mode === "json-schema",
              jsonSchemaEffort: input.jsonSchemaEffort,
              disableThinking: providerCapabilitiesFor(provider.baseUrl, model, provider.protocol).disableThinking,
            });
            const response = await fetch(request.url, {
              method: "POST",
              headers: request.headers,
              body: JSON.stringify(request.body),
              signal: input.runtimeControls.requestSignal(input.requestTimeoutMs),
            });
            const payload = await response.json().catch(() => null) as unknown;
            result = { response, payload };
            lastResult = result;
          } catch (error) {
            lastRequestError = error;
            lastError = error instanceof Error ? error : new Error(String(error));
            const meta = metaFor({
              callId, agent: input.agent, shard: input.shard, provider: providerLabel, model, mode,
              promptVersion: input.promptVersion, startedAt, startedMark, attempt, fallbackCount,
              templateId: input.templateId, adapterVersion: input.adapterVersion, inputRefs: input.inputRefs, contentHash,
            });
            input.tracer?.emit({ type: "model.failed", step: input.step, meta, errorCode: "request_failed" });
            fallbackCount += 1;
            const failureCount = input.runtimeControls.circuitBreaker.recordFailure(providerLabel);
            if (input.runtimeControls.circuitBreaker.isOpen(providerLabel)) continue providerLoop;
            await input.runtimeControls.boundedBackoff(failureCount);
            continue;
          }

          const meta = metaFor({
            callId, agent: input.agent, shard: input.shard, provider: providerLabel, model, mode,
            promptVersion: input.promptVersion, startedAt, startedMark, attempt, fallbackCount,
            payload: result.payload,
            templateId: input.templateId, adapterVersion: input.adapterVersion, inputRefs: input.inputRefs, contentHash,
          });
          if (result.response.ok) {
            input.runtimeControls.circuitBreaker.recordSuccess(providerLabel);
            const outcome = input.handleResponse({ payload: result.payload, response: result.response, model, mode, providerLabel });
            if (outcome.outcome === "success") {
              input.tracer?.emit({ type: "model.completed", step: input.step, meta });
              return { data: outcome.data, meta };
            }
            retryOutcomes.push({ errorCode: outcome.errorCode, detail: outcome.detail });
            lastError = new Error(outcome.detail || outcome.errorCode);
            input.tracer?.emit({
              type: "model.failed",
              step: input.step,
              meta,
              errorCode: outcome.errorCode,
              ...(outcome.diagnostic !== undefined ? { diagnostic: outcome.diagnostic } : {}),
            });
            fallbackCount += 1;
            continue;
          }

          input.tracer?.emit({ type: "model.failed", step: input.step, meta, errorCode: `http_${result.response.status}` });
          {
            const detail = providerErrorDetail(result.payload);
            lastError = new Error(`provider returned ${result.response.status}${detail ? `: ${detail}` : ""}`);
          }
          if (result.response.status >= 400 && result.response.status < 500) {
            // Provider 4xx bodies carry the exact request-validation reason;
            // the trace deliberately stores only the status code, so log
            // the sanitized message server-side for diagnosis.
            console.error(
              `[${input.logLabel}] ${result.response.status} from ${providerLabel}/${model}:`,
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
  throw new ModelServiceExhaustedError({ lastResult, lastRequestError, retryOutcomes, lastError });
}
