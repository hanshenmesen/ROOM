import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { agentCostMetrics } from "../lib/evals/cost-metrics.ts";
import { evidenceIsValid } from "../lib/evals/evidence-metrics.ts";
import { matchProfileItems } from "../lib/evals/item-matcher.ts";
import { compareProfileEvalReports } from "../lib/evals/report.ts";
import type { GoldProfileItem, ProfileEvalReport } from "../lib/evals/types.ts";
import type { ProfileItem } from "../lib/types.ts";

test("item matching is deterministic, one-to-one, and kind-aware", () => {
  const gold: GoldProfileItem[] = [{
    id: "room",
    kind: "project",
    canonicalTitle: "ROOM Agent World",
    aliases: ["ROOM"],
  }];
  const candidate = [{
    id: "candidate-room",
    kind: "project",
    title: "ROOM",
    summary: "Agent world",
    bullets: [],
    tags: [],
    evidence: [],
  }] as ProfileItem[];
  const result = matchProfileItems(gold, candidate);
  assert.equal(result.matches.length, 1);
  assert.equal(result.missed.length, 0);
  assert.equal(result.unexpected.length, 0);
});

test("evidence accuracy requires the excerpt and locator to resolve to source text", () => {
  const source = "Name\nProject Alpha\nBuilt a citation verifier.";
  assert.equal(evidenceIsValid({
    sourceId: "source",
    locator: "line:3",
    excerpt: "Built a citation verifier.",
  }, source), true);
  assert.equal(evidenceIsValid({
    sourceId: "source",
    locator: "line:2",
    excerpt: "Built a citation verifier.",
  }, source), false);
});

test("cost metrics distinguish first-pass extraction from a successful repair", () => {
  const base = { runId: "run", occurredAt: "2026-08-05T00:00:00.000Z" };
  const meta = {
    callId: "call",
    agent: "profile-agent",
    provider: "provider.example",
    model: "model",
    mode: "json-schema" as const,
    promptVersion: "profile.identity.v1",
    startedAt: base.occurredAt,
    latencyMs: 25,
    inputTokens: 10,
    outputTokens: 5,
    attempt: 2,
    fallbackCount: 0,
  };
  const metrics = agentCostMetrics([
    { ...base, eventId: "retry", type: "step.retried", step: "profile.validate", attempt: 2, reason: "invalid" },
    { ...base, eventId: "complete", type: "model.completed", step: "profile.identity", meta },
  ]);
  assert.equal(metrics.schemaFirstPassRate, 0);
  assert.equal(metrics.repairSuccessRate, 1);
  assert.equal(metrics.modelCalls, 1);
  assert.equal(metrics.inputTokens, 10);
  assert.equal(metrics.outputTokens, 5);
});

test("report comparison identifies quality regressions and handles inverse unsupported-claim direction", () => {
  const baseline = JSON.parse(readFileSync(
    new URL("../evals/reports/smoke-baseline.json", import.meta.url),
    "utf8",
  )) as ProfileEvalReport;
  const candidate = structuredClone(baseline);
  candidate.summary.itemRecall = 0.8;
  candidate.summary.unsupportedClaimRate = 0.1;
  const comparison = compareProfileEvalReports(baseline, candidate);
  assert.equal(comparison.passed, false);
  assert.deepEqual(comparison.regressions, ["itemRecall", "unsupportedClaimRate"]);
});

test("the smoke CLI produces JSON and Markdown without network access", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "room-profile-eval-"));
  const output = join(temporaryDirectory, "smoke");
  try {
    const stdout = execFileSync(process.execPath, [
      "scripts/profile-eval.mjs",
      "--dataset",
      "smoke",
      "--output",
      output,
    ], {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8",
    });
    const result = JSON.parse(stdout) as { status: string; cases: number; humanVerifiedCases: number };
    assert.equal(result.status, "fail");
    assert.equal(result.cases, 5);
    assert.equal(result.humanVerifiedCases, 2);
    const report = JSON.parse(readFileSync(`${output}.json`, "utf8")) as ProfileEvalReport;
    assert.equal(report.summary.itemF1, 0.8519);
    assert.equal(report.failureCounts.missed_item, 4);
    assert.equal(report.failureCounts.forbidden_claim || 0, 0);
    const markdown = readFileSync(`${output}.md`, "utf8");
    assert.match(markdown, /smoke-prompt-injection[^\n]*PASS/);
    assert.doesNotMatch(markdown, /Forbidden claim appeared/);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("generated fixtures stay current and compose a thirty-case full dataset", () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "room-profile-eval-full-"));
  const output = join(temporaryDirectory, "full");
  try {
    const fixtureStatus = JSON.parse(execFileSync(process.execPath, [
      "scripts/generate-profile-eval-fixtures.mjs",
    ], {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8",
    })) as { status: string; generatedCases: number; totalFullCases: number };
    assert.deepEqual(fixtureStatus, { status: "current", generatedCases: 25, totalFullCases: 30 });

    const result = JSON.parse(execFileSync(process.execPath, [
      "scripts/profile-eval.mjs",
      "--dataset",
      "full",
      "--output",
      output,
    ], {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8",
    })) as { status: string; cases: number; humanVerifiedCases: number };
    assert.equal(result.status, "fail");
    assert.equal(result.cases, 30);
    assert.equal(result.humanVerifiedCases, 2);
    const report = JSON.parse(readFileSync(`${output}.json`, "utf8")) as ProfileEvalReport;
    assert.equal(new Set(report.cases.map((entry) => entry.caseId)).size, 30);
    assert.equal(report.cases.filter((entry) => entry.caseId.startsWith("full-")).length, 25);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("the Profile Agent experiment preflight never exposes or calls provider secrets", () => {
  const stdout = execFileSync(process.execPath, [
    "scripts/profile-eval-experiment.mjs",
    "--dataset",
    "smoke",
    "--preflight",
  ], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
    env: {
      ...process.env,
      MAAS_API_KEY: "",
      MAAS_API_KEY_FALLBACK: "",
      WEBSITE_AGENT_API_KEY: "",
      WEBSITE_AGENT_API_KEY_FALLBACK: "",
    },
  });
  const result = JSON.parse(stdout) as {
    status: string;
    provider: string;
    secretsExposed: boolean;
    requiresAllowModelCalls: boolean;
  };
  assert.equal(result.status, "blocked");
  assert.equal(result.provider, "not-configured");
  assert.equal(result.secretsExposed, false);
  assert.equal(result.requiresAllowModelCalls, true);
});
