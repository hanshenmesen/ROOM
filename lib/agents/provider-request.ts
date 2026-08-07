import { internalMaasAppId, internalMaasHost } from "./provider-env.ts";
import type { MaasContentBlock } from "./profile/types.ts";

/**
 * ROOM speaks two distinct provider protocols:
 *
 * - "anthropic": Anthropic Messages API (`/v1/messages` or `/messages`).
 *   Used by the DeepSeek official Anthropic-compatible endpoint, the
 *   external MAAS gateway, and Zhizengzeng. Structured output is either a
 *   forced tool call or `output_config.format` JSON schema.
 * - "xhs-maas": an internal OpenAI Chat Completions-compatible MAAS
 *   gateway (host injected via INTERNAL_MAAS_HOST, see provider-env.ts).
 *   Auth is a bespoke header set (`api-key` / `x-maas-user-email` /
 *   `x-maas-app-id`), not `Authorization: Bearer`. Structured output is
 *   OpenAI function calling; there is no `output_config` equivalent.
 *
 * Every model call site (profile shards, website planner, pet QA) must use
 * this module instead of hand-building the request, so a protocol fix only
 * needs to happen once. See ADR-less rationale: petQa previously drifted
 * out of sync with profile/website on the DeepSeek thinking-disable fix
 * because the request body was duplicated three times.
 */
export type ProviderProtocol = "anthropic" | "xhs-maas";

export function isXhsMaasGatewayProvider(value: string) {
  const host = internalMaasHost();
  if (!host) return false;
  try {
    const candidate = value.includes("://") ? value : `https://${value}`;
    return new URL(candidate).hostname.toLowerCase() === host;
  } catch {
    return false;
  }
}

export function isDeepSeekProvider(value: string) {
  try {
    const candidate = value.includes("://") ? value : `https://${value}`;
    return new URL(candidate).hostname === "api.deepseek.com";
  } catch {
    return false;
  }
}

export function providerProtocolForBaseUrl(baseUrl: string): ProviderProtocol {
  return isXhsMaasGatewayProvider(baseUrl) ? "xhs-maas" : "anthropic";
}

/** Converts Anthropic-style content blocks to OpenAI Chat Completions content parts. */
function toOpenAiUserContent(content: string | MaasContentBlock[]): string | Array<Record<string, unknown>> {
  if (typeof content === "string") return content;
  return content.map((block) => {
    if (block.type === "text") return { type: "text", text: block.text };
    if (block.type === "image") {
      return { type: "image_url", image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` } };
    }
    // OpenAI Chat Completions has no standard inline-PDF content part. The
    // xhs-maas gateway is not currently used for PDF/image extraction (see
    // README multimodal boundary); fail loudly instead of silently dropping
    // the attachment if this path is ever reached.
    throw new Error("The xhs-maas provider does not support PDF document attachments.");
  });
}

export type ToolCallRequestInput = {
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKey: string;
  userEmail?: string;
  model: string;
  system: string;
  userContent: string | MaasContentBlock[];
  temperature: number;
  maxOutputTokens: number;
  toolName: string;
  toolDescription: string;
  toolSchema: Record<string, unknown>;
  /** Anthropic-only: forces json-schema structured output instead of a tool call. */
  jsonSchemaMode?: boolean;
  jsonSchemaEffort?: "low" | "high" | "max";
  /** Anthropic-only, DeepSeek official endpoint: disables default thinking. */
  disableThinking?: boolean;
};

export type ProviderRequest = {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

function anthropicMessagesUrl(baseUrl: string) {
  const trimmed = baseUrl.replace(/\/$/, "");
  return `${/\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`}/messages`;
}

/**
 * Builds the fetch URL, headers, and body for one model call. Callers
 * remain responsible for the provider/mode/model iteration loop, retries,
 * and circuit breaking; this function only owns the wire-format decision.
 */
export function buildToolCallRequest(input: ToolCallRequestInput): ProviderRequest {
  if (input.protocol === "xhs-maas") {
    return {
      url: `${input.baseUrl.replace(/\/$/, "")}/v1/chat/completions`,
      headers: {
        "content-type": "application/json",
        "api-key": input.apiKey,
        "x-maas-user-email": input.userEmail || "",
        "x-maas-app-id": internalMaasAppId(),
      },
      body: {
        model: input.model,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: toOpenAiUserContent(input.userContent) },
        ],
        stream: false,
        temperature: input.temperature,
        max_tokens: input.maxOutputTokens,
        // The internal gateway proxies the same deepseek-v4-pro model as the
        // Anthropic-format endpoints and defaults to thinking mode on too:
        // observed in production spending the entire max_tokens budget on
        // reasoning for a dense "items" extraction (8-10 min calls, finish
        // reason "length", truncated JSON) with this field omitted. Passing
        // the same `thinking: {type: "disabled"}` shape used on the
        // Anthropic protocol disables it here as well.
        ...(input.disableThinking ? { thinking: { type: "disabled" } } : {}),
        tools: [{
          type: "function",
          function: {
            name: input.toolName,
            description: input.toolDescription,
            parameters: input.toolSchema,
          },
        }],
        // Pins the single declared function without requiring the caller to
        // repeat its name, mirroring the Anthropic `tool_choice: {type:
        // "any"}` semantics used elsewhere in ROOM.
        tool_choice: { type: "function", function: { name: input.toolName } },
      },
    };
  }

  return {
    url: anthropicMessagesUrl(input.baseUrl),
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: {
      model: input.model,
      system: input.system,
      messages: [{ role: "user", content: input.userContent }],
      temperature: input.temperature,
      max_tokens: input.maxOutputTokens,
      ...(input.disableThinking ? { thinking: { type: "disabled" } } : {}),
      ...(input.jsonSchemaMode ? {
        output_config: {
          effort: input.jsonSchemaEffort || "low",
          format: { type: "json_schema", schema: input.toolSchema },
        },
      } : {
        tools: [{
          name: input.toolName,
          description: input.toolDescription,
          input_schema: input.toolSchema,
        }],
        // Anthropic thinking mode rejects a named tool_choice ("Thinking
        // mode does not support this tool_choice"); `any` forces the single
        // declared tool without naming it and works with or without
        // thinking enabled.
        tool_choice: { type: "any" },
      }),
    },
  };
}
