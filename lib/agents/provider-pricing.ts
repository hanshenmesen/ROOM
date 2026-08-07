/**
 * Per-provider price list for budget reservations and trace cost estimates.
 *
 * Budgets are only as honest as their price assumptions: a single hardcoded
 * Claude price overestimates DeepSeek calls ~30x, which would exhaust the
 * shared run budget long before the real dollar ceiling. Prices are
 * list prices as of 2026-08 (cache-miss where applicable) and stay labelled
 * as estimates — the authoritative number is always the provider bill.
 */

export type ProviderPricing = {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
};

const CLAUDE_TIER_PRICING: ProviderPricing = {
  inputPerMillionUsd: 15,
  outputPerMillionUsd: 75,
};

const DEEPSEEK_V4_PRO_PRICING: ProviderPricing = {
  inputPerMillionUsd: 0.435,
  outputPerMillionUsd: 0.87,
};

export function pricingForProvider(baseUrlOrHost: string): ProviderPricing {
  let host = baseUrlOrHost;
  try {
    host = new URL(baseUrlOrHost).hostname;
  } catch {
    // Already a bare host.
  }
  if (host === "api.deepseek.com") return DEEPSEEK_V4_PRO_PRICING;
  if (host === "maas.devops.xiaohongshu.com") {
    // The internal gateway serves deepseek-v4-pro at DeepSeek-tier cost and
    // qwen3.5 at an unverified but comparable tier. Pricing it at the
    // Claude fallback overestimated calls ~34x, which exhausted the shared
    // run budget mid-retry and masked the real provider error behind an
    // estimated_cost exhaustion (observed in the provider smoke gate).
    return DEEPSEEK_V4_PRO_PRICING;
  }
  return CLAUDE_TIER_PRICING;
}

/** Estimated USD cost of one model call at the provider's list price. */
export function estimateCallCostUsd(baseUrlOrHost: string, inputTokens: number, outputTokens: number) {
  const pricing = pricingForProvider(baseUrlOrHost);
  return (inputTokens * pricing.inputPerMillionUsd + outputTokens * pricing.outputPerMillionUsd) / 1_000_000;
}
