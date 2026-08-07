import {
  isDeepSeekProvider,
  isXhsMaasGatewayProvider,
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

function xhsMaasCapabilities(model: string): ProviderCapabilities {
  return {
    protocol: "xhs-maas",
    // OpenAI Chat Completions has no standard inline-PDF content part, and
    // the models currently served by the internal gateway are text-only.
    supportsDocumentBlocks: false,
    supportsImageBlocks: false,
    // The gateway's `thinking` field is DeepSeek-specific; sending it to
    // other models (e.g. qwen3.5) risks a request-validation rejection.
    disableThinking: /^deepseek(?:-|$)/i.test(model.trim()),
  };
}

/** Resolves the capability row for a provider host + model pair. */
export function providerCapabilitiesFor(baseUrl: string, model: string): ProviderCapabilities {
  if (isXhsMaasGatewayProvider(baseUrl)) return xhsMaasCapabilities(model);
  if (isDeepSeekProvider(baseUrl)) return DEEPSEEK_OFFICIAL;
  return CLAUDE_COMPATIBLE;
}
