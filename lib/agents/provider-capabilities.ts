import {
  isDeepSeekProvider,
  isInternalMaasGatewayProvider,
  type ProviderProtocol,
} from "./provider-request.ts";

/**
 * Explicit capability matrix for the providers ROOM ships with.
 *
 * Integrating the internal MAAS gateway surfaced a steady stream of
 * provider-specific differences -- thinking-mode defaults, tool_choice
 * shapes, document/image support, JSON-schema adherence -- and every one
 * of them was discovered by a production failure instead of by the code.
 * This module turns those hard-won facts into data: one row per provider,
 * consumed by request building and by the parse route's input handling, so
 * adding a new provider means adding one row instead of hunting string
 * checks across the codebase.
 *
 * Keep entries honest: a capability is true only when verified end-to-end
 * against the real provider, not when it "should" work by protocol.
 */
export type ProviderCapabilities = {
  /** Wire protocol used for requests. */
  protocol: ProviderProtocol;
  /**
   * Whether Anthropic-style `document` content blocks (PDF attachments)
   * may be sent. When false, the parse route feeds the provider ROOM's
   * locally extracted text with line-numbered evidence instead.
   */
  supportsDocumentBlocks: boolean;
  /** Whether image content blocks may be sent. */
  supportsImageBlocks: boolean;
  /**
   * Whether requests must explicitly disable the provider's reasoning
   * ("thinking") mode. DeepSeek V4 defaults thinking on and counts
   * reasoning toward max_tokens, which repeatedly exhausted the output
   * budget on dense extractions until disabled.
   */
  disableThinking: boolean;
};

const CLAUDE_COMPATIBLE: ProviderCapabilities = {
  protocol: "anthropic",
  supportsDocumentBlocks: true,
  supportsImageBlocks: true,
  disableThinking: false,
};

const DEEPSEEK_OFFICIAL: ProviderCapabilities = {
  protocol: "anthropic",
  // DeepSeek's official Anthropic-compatible endpoint rejects
  // image/document content blocks (see the README boundary note).
  supportsDocumentBlocks: false,
  supportsImageBlocks: false,
  disableThinking: true,
};

const OPENAI_CHAT_COMPLETIONS: ProviderCapabilities = {
  protocol: "openai",
  // Generic visitor gateways are treated conservatively: Chat Completions
  // has no portable PDF block, and image support depends on the selected
  // upstream model rather than the protocol alone.
  supportsDocumentBlocks: false,
  supportsImageBlocks: false,
  disableThinking: false,
};

function internalMaasCapabilities(model: string): ProviderCapabilities {
  return {
    protocol: "internal-maas",
    // OpenAI Chat Completions has no standard inline-PDF content part, and
    // the models currently served by the internal gateway are text-only.
    supportsDocumentBlocks: false,
    supportsImageBlocks: false,
    // The gateway's `thinking` field is DeepSeek-specific; sending it to
    // non-DeepSeek models risks a request-validation rejection.
    disableThinking: /^deepseek(?:-|$)/i.test(model.trim()),
  };
}

/** Resolves the capability row for a provider host + model pair. */
export function providerCapabilitiesFor(baseUrl: string, model: string, protocol?: ProviderProtocol): ProviderCapabilities {
  if (isInternalMaasGatewayProvider(baseUrl)) return internalMaasCapabilities(model);
  if (isDeepSeekProvider(baseUrl)) return DEEPSEEK_OFFICIAL;
  if (protocol === "openai") return OPENAI_CHAT_COMPLETIONS;
  return CLAUDE_COMPATIBLE;
}

/**
 * Structured-output mode fallback order for one provider call attempt.
 *
 * Non-Anthropic protocols (`openai`, `internal-maas`) and DeepSeek's official
 * endpoint only ever speak OpenAI-style function calling / Anthropic Tool
 * Use -- there is no `output_config.format` equivalent to fall back to, so
 * they get a single-element `["tool"]` order. Anthropic-protocol providers
 * try the configured preference first, then the other mode, so a provider
 * that silently ignores `output_config` still has one more attempt before
 * the call site gives up.
 *
 * Extracted from the near-identical provider-iteration loops in the website
 * planner and the profile agent provider, which had independently derived
 * the same table (written with inverted conditions, but producing the same
 * order) -- exactly the kind of drift risk a single source of truth removes.
 */
export function routeProviderModes(input: {
  protocol: ProviderProtocol;
  mode: "json-schema" | "tool";
  deepSeek: boolean;
}): readonly ("tool" | "json-schema")[] {
  if (input.protocol !== "anthropic" || input.deepSeek) return ["tool"];
  return input.mode === "json-schema" ? ["json-schema", "tool"] : ["tool", "json-schema"];
}
