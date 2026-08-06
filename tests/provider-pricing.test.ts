import assert from "node:assert/strict";
import test from "node:test";
import { estimateCallCostUsd, pricingForProvider } from "../lib/agents/provider-pricing.ts";

test("pricing follows the provider host, with DeepSeek at list price", () => {
  const deepseek = pricingForProvider("https://api.deepseek.com/anthropic");
  assert.equal(deepseek.inputPerMillionUsd, 0.435);
  assert.equal(deepseek.outputPerMillionUsd, 0.87);

  const claude = pricingForProvider("https://maas.devops.rednote.life/hackson");
  assert.equal(claude.inputPerMillionUsd, 15);
  assert.equal(claude.outputPerMillionUsd, 75);

  // Bare hosts and unknown providers fall back to the Claude tier.
  assert.equal(pricingForProvider("api.deepseek.com"), deepseek);
  assert.equal(pricingForProvider("custom-provider"), claude);
});

test("cost estimates stay provider-aware instead of hardcoding one price", () => {
  const inputTokens = 10_000;
  const outputTokens = 4_000;
  const deepseekCost = estimateCallCostUsd("https://api.deepseek.com/anthropic", inputTokens, outputTokens);
  const claudeCost = estimateCallCostUsd("https://maas.devops.rednote.life/hackson", inputTokens, outputTokens);

  assert.ok(deepseekCost > 0);
  // DeepSeek list pricing is far below the Claude tier; the old single-price
  // estimate would have exhausted budgets ~30x too early.
  assert.ok(claudeCost / deepseekCost > 30);
  assert.equal(Number(deepseekCost.toFixed(6)), 0.00783);
});
