import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareProfileEvalReports } from "../lib/evals/report.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function providerReadiness() {
  const maas = Boolean(process.env.MAAS_API_KEY?.trim() || process.env.MAAS_API_KEY_FALLBACK?.trim());
  const website = Boolean(process.env.WEBSITE_AGENT_API_KEY?.trim() || process.env.WEBSITE_AGENT_API_KEY_FALLBACK?.trim());
  return {
    ready: maas || website,
    resumeProvider: maas ? "MAAS" : website ? "Website fallback" : "not-configured",
    secretsExposed: false,
  };
}

function comparisonMarkdown(comparison, baseline, candidate) {
  const labels = {
    identityAccuracy: "Identity Accuracy",
    itemPrecision: "Item Precision",
    itemRecall: "Item Recall",
    itemF1: "Item F1",
    fieldAccuracy: "Field Accuracy",
    evidenceCoverage: "Evidence Coverage",
    evidenceAccuracy: "Evidence Accuracy",
    unsupportedClaimRate: "Unsupported Claim Rate",
    endToEndSuccess: "End-to-end Success",
  };
  return [
    "# Profile Eval Experiment: " + baseline.dataset,
    "",
    "- Status: **" + (comparison.passed ? "PASS" : "REGRESSION") + "**",
    "- Baseline runner: `" + baseline.runner + "`",
    "- Candidate runner: `" + candidate.runner + "`",
    "- Cases: " + candidate.caseCount,
    "",
    "## Metric deltas",
    "",
    "| Metric | Baseline | Candidate | Delta |",
    "| --- | ---: | ---: | ---: |",
    ...Object.entries(comparison.deltas).map(([key, delta]) => (
      "| " + labels[key] + " | " + baseline.summary[key] + " | " + candidate.summary[key] + " | " + (delta > 0 ? "+" : "") + delta + " |"
    )),
    "",
    "## Regressions",
    "",
    ...(comparison.regressions.length ? comparison.regressions.map((value) => "- `" + value + "`") : ["No regressions."]),
    "",
  ].join("\n");
}

const dataset = argument("--dataset") || "smoke";
if (!/^[a-z0-9][a-z0-9-]*$/.test(dataset)) throw new Error("Dataset id is invalid.");
const readiness = providerReadiness();
const outputBase = argument("--output")
  ? resolve(process.cwd(), argument("--output"))
  : resolve(root, "outputs/evals/experiments/" + dataset);
const preflight = {
  status: readiness.ready ? "ready" : "blocked",
  dataset,
  provider: readiness.resumeProvider,
  secretsExposed: false,
  requiresAllowModelCalls: true,
  expectedOutputs: [
    outputBase + "-deterministic.json",
    outputBase + "-profile-agent.json",
    outputBase + "-comparison.json",
    outputBase + "-comparison.md",
  ],
};

if (process.argv.includes("--preflight")) {
  console.log(JSON.stringify(preflight, null, 2));
  process.exit(0);
}
if (!process.argv.includes("--allow-model-calls")) {
  throw new Error("Refusing to call a paid model without --allow-model-calls. Run with --preflight first.");
}
if (!readiness.ready) {
  throw new Error("Profile Agent provider is not configured. No model calls were made.");
}

await mkdir(dirname(outputBase), { recursive: true });
const runEval = (runner, output) => execFileSync(process.execPath, [
  "scripts/profile-eval.mjs",
  "--dataset", dataset,
  "--runner", runner,
  "--output", output,
], { cwd: root, stdio: "inherit" });
runEval("deterministic-pipeline", outputBase + "-deterministic");
runEval("profile-agent", outputBase + "-profile-agent");

const baseline = JSON.parse(await readFile(outputBase + "-deterministic.json", "utf8"));
const candidate = JSON.parse(await readFile(outputBase + "-profile-agent.json", "utf8"));
const comparison = compareProfileEvalReports(baseline, candidate);
await writeFile(outputBase + "-comparison.json", JSON.stringify(comparison, null, 2) + "\n", "utf8");
await writeFile(outputBase + "-comparison.md", comparisonMarkdown(comparison, baseline, candidate), "utf8");
console.log(JSON.stringify({
  status: comparison.passed ? "pass" : "regression",
  dataset,
  comparison: outputBase + "-comparison.json",
  report: outputBase + "-comparison.md",
}, null, 2));
if (!comparison.passed) process.exitCode = 1;
