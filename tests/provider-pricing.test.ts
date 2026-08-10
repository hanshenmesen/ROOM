import assert from "node:assert/strict";
import test from "node:test";
import { estimateCallCostUsd, pricingForProvider } from "../lib/agents/provider-pricing.ts";
process.env.INTERNAL_MAAS_HOST = "internal-maas.example";


test("pricing follows the provider host, with DeepSeek at list price", () => {
  const deepseek = pricingForProvider("https://api.deepseek.com/anthropic");
  assert.equal(deepseek.inputPerMillionUsd, 0.435);
  assert.equal(deepseek.outputPerMillionUsd, 0.87);

  const claude = pricingForProvider("https://external-maas.example/hackson");
  assert.equal(claude.inputPerMillionUsd, 15);
  assert.equal(claude.outputPerMillionUsd, 75);

  // Bare hosts and unknown providers fall back to the Claude tier.
  assert.equal(pricingForProvider("api.deepseek.com"), deepseek);
  assert.equal(pricingForProvider("custom-provider"), claude);
});

test("the internal MAAS gateway prices at the DeepSeek tier, not the Claude fallback", () => {
  // Regression: the gateway was priced at the Claude fallback (~34x too
  // high), which exhausted the shared run budget mid-retry and masked the
  // real provider error behind an estimated_cost exhaustion.
  assert.deepEqual(
    pricingForProvider("https://internal-maas.example"),
    pricingForProvider("https://api.deepseek.com/anthropic"),
  );
});

test("cost estimates stay provider-aware instead of hardcoding one price", () => {
  const inputTokens = 10_000;
  const outputTokens = 4_000;
  const deepseekCost = estimateCallCostUsd("https://api.deepseek.com/anthropic", inputTokens, outputTokens);
  const claudeCost = estimateCallCostUsd("https://external-maas.example/hackson", inputTokens, outputTokens);

  assert.ok(deepseekCost > 0);
  // DeepSeek list pricing is far below the Claude tier; the old single-price
  // estimate would have exhausted budgets ~30x too early.
  assert.ok(claudeCost / deepseekCost > 30);
  assert.equal(Number(deepseekCost.toFixed(6)), 0.00783);
});
