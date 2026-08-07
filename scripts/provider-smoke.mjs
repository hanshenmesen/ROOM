#!/usr/bin/env node
/**
 * Real-provider smoke gate.
 *
 * The offline eval suite mocks provider responses, so it cannot catch
 * provider-specific wire/behaviour differences (thinking-mode budgets,
 * tool_choice shapes, schema adherence, evidence contracts) -- every one of
 * those was historically discovered by a production failure. This script
 * runs one small fictional resume through the real Profile Agent for each
 * configured provider target and reports compatibility per target:
 * pass/fail, per-call latency and token usage, and -- on failure -- the
 * structural diagnostics attached to the failing trace events.
 *
 * Usage:
 *   node scripts/provider-smoke.mjs                  # preflight only, no calls
 *   node scripts/provider-smoke.mjs --allow-model-calls
 *
 * Credentials come from the standard env slots (or .env.local). Model calls
 * cost money and need network access, so they require the explicit flag.
 */
import process from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentProviderConfig } from "../lib/agents/provider-config.ts";
import { providerCapabilitiesFor } from "../lib/agents/provider-capabilities.ts";
import { extractProfileWithAgentRun } from "../lib/agents/profile-agent.ts";
import { createAgentTracer } from "../lib/agent-runtime/tracer.ts";
import { sampleResume } from "../lib/data/sample-resume.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (!process.argv.includes("--ignore-local-env")) {
  try {
    process.loadEnvFile(resolve(root, ".env.local"));
  } catch (error) {
    if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error;
  }
}

const ALLOW_CALLS = process.argv.includes("--allow-model-calls");
// Smoke runs should fail in minutes, not inherit the production 40-minute
// wall-clock budget.
const SMOKE_BUDGET = { maxModelCalls: 8, maxDurationMs: 10 * 60_000, maxEstimatedCostUsd: 2 };

function smokeTargets() {
  const config = getAgentProviderConfig();
  const slots = [
    ["maas", config.maas],
    ["website", config.website],
    ["petQa", config.petQa],
  ];
  const seen = new Set();
  const targets = [];
  for (const [slot, provider] of slots) {
    for (const apiKey of provider.apiKeys) {
      const dedupeKey = `${provider.baseUrl}|${provider.model}|${apiKey}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      targets.push({
        slot,
        baseUrl: provider.baseUrl,
        model: provider.model,
        apiKey,
        userEmail: provider.userEmail,
        capabilities: providerCapabilitiesFor(provider.baseUrl, provider.model),
      });
    }
  }
  return targets;
}

function callSummaries(events) {
  return events
    .filter((event) => event.type === "model.completed" || event.type === "model.failed")
    .map((event) => ({
      step: event.step,
      status: event.type === "model.completed" ? "ok" : event.errorCode,
      latencyMs: event.meta.latencyMs,
      outputTokens: event.meta.outputTokens ?? null,
      stopReason: event.meta.stopReason ?? null,
      ...(event.type === "model.failed" && event.diagnostic ? { diagnostic: event.diagnostic } : {}),
    }));
}

async function smokeTarget(target) {
  const tracer = createAgentTracer();
  const startedAt = performance.now();
  try {
    const { profile } = await extractProfileWithAgentRun(
      sampleResume,
      { type: "text", label: "sample-resume.ts", format: "text" },
      {
        tracer,
        budget: SMOKE_BUDGET,
        providerConfig: {
          maasApiKey: target.apiKey,
          maasBaseUrl: target.baseUrl,
          maasModel: target.model,
          maasUserEmail: target.userEmail,
        },
      },
    );
    return {
      target: `${target.slot} · ${target.baseUrl} · ${target.model}`,
      status: "pass",
      durationMs: Math.round(performance.now() - startedAt),
      profile: {
        name: profile.name,
        headline: profile.headline,
        items: profile.items.length,
        skills: profile.skills.length,
      },
      calls: callSummaries(tracer.snapshot()?.events || []),
    };
  } catch (error) {
    return {
      target: `${target.slot} · ${target.baseUrl} · ${target.model}`,
      status: "fail",
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
      details: error && typeof error === "object" && "details" in error ? error.details : [],
      calls: callSummaries(tracer.snapshot()?.events || []),
    };
  }
}

const targets = smokeTargets();
const preflight = {
  mode: "preflight",
  note: "未发起模型调用。加 --allow-model-calls 后才会对每个已配置 Provider 目标执行真实冒烟。",
  targets: targets.map((target) => ({
    slot: target.slot,
    baseUrl: target.baseUrl,
    model: target.model,
    capabilities: target.capabilities,
    hasUserEmail: Boolean(target.userEmail),
  })),
};

if (!targets.length) {
  console.log(JSON.stringify({ ...preflight, warning: "没有配置任何 Provider API key。" }, null, 2));
  process.exit(1);
}

if (!ALLOW_CALLS) {
  console.log(JSON.stringify(preflight, null, 2));
  process.exit(0);
}

console.log(`Provider 冒烟：${targets.length} 个目标，逐个执行真实 Profile Agent 调用…`);
const results = [];
for (const target of targets) {
  // Sequential on purpose: the report should isolate per-provider behaviour,
  // not measure gateway concurrency.
  results.push(await smokeTarget(target));
  const last = results.at(-1);
  console.log(`${last.status === "pass" ? "✔" : "✖"} ${last.target} (${(last.durationMs / 1000).toFixed(1)}s)`);
}

const failed = results.filter((result) => result.status === "fail");
console.log(JSON.stringify({
  mode: "smoke",
  passed: failed.length === 0,
  passedTargets: results.length - failed.length,
  failedTargets: failed.length,
  results,
}, null, 2));
if (failed.length) process.exitCode = 1;
