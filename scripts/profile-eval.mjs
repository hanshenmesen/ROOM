import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileProfile, runPipeline } from "../lib/agents/pipeline.ts";
import { extractProfileWithAgentRun } from "../lib/agents/profile-agent.ts";
import { evaluateProfileCase, profileCaseContainsExpectedSourceEvidence } from "../lib/evals/profile-metrics.ts";
import { buildProfileEvalReport, profileEvalReportMarkdown } from "../lib/evals/report.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function validateCase(value, expectedId, datasetId) {
  if (!value || typeof value !== "object") throw new Error(`${expectedId} must be a JSON object.`);
  if (value.schemaVersion !== "profile-eval-case.v1") throw new Error(`${expectedId} has an unsupported schemaVersion.`);
  if (value.id !== expectedId || value.dataset !== datasetId) throw new Error(`${expectedId} has inconsistent identity fields.`);
  if (!["prelabeled", "human-verified"].includes(value.reviewStatus)) throw new Error(`${expectedId} has an invalid reviewStatus.`);
  if (!value.source?.path || value.source.type !== "text") throw new Error(`${expectedId} must reference a text source.`);
  if (!value.expected?.identity?.name || !Array.isArray(value.expected.items)) throw new Error(`${expectedId} is missing Gold identity or items.`);
  return value;
}

async function loadDataset(datasetId) {
  const datasetPath = resolve(root, `evals/datasets/${datasetId}.json`);
  const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
  if (dataset.schemaVersion !== "profile-eval-dataset.v1" || dataset.id !== datasetId) {
    throw new Error(`Dataset ${datasetId} has an invalid contract.`);
  }
  const cases = await Promise.all(dataset.cases.map(async (caseId) => {
    const casePath = resolve(root, `evals/cases/${caseId}.json`);
    const gold = validateCase(JSON.parse(await readFile(casePath, "utf8")), caseId, datasetId);
    const sourcePath = resolve(dirname(casePath), gold.source.path);
    const sourceText = await readFile(sourcePath, "utf8");
    if (!profileCaseContainsExpectedSourceEvidence(gold, sourceText)) {
      throw new Error(`${caseId} contains expectedEvidence that is absent from its source.`);
    }
    return { gold, sourceText };
  }));
  return { dataset, cases };
}

async function runCase(entry, runner) {
  if (runner === "deterministic-pipeline") {
    const pipeline = runPipeline(entry.sourceText, {
      type: "text",
      label: entry.gold.source.label,
    });
    return evaluateProfileCase({
      ...entry,
      profile: pipeline.profile,
      pipeline,
      events: pipeline.run?.events,
    });
  }
  if (runner === "profile-agent") {
    const agentRun = await extractProfileWithAgentRun(entry.sourceText, {
      type: "text",
      label: entry.gold.source.label,
      format: "text",
    });
    const pipeline = compileProfile(agentRun.profile, { priorEvents: agentRun.run.events });
    return evaluateProfileCase({
      ...entry,
      profile: pipeline.profile,
      pipeline,
      events: agentRun.run.events,
    });
  }
  throw new Error(`Unsupported Eval runner: ${runner}.`);
}

const datasetId = argument("--dataset") || "smoke";
const loaded = await loadDataset(datasetId);
const runner = argument("--runner") || loaded.dataset.runner;
const results = [];
for (const entry of loaded.cases) results.push(await runCase(entry, runner));
const report = buildProfileEvalReport({
  dataset: datasetId,
  runner,
  thresholds: loaded.dataset.thresholds || {},
  results,
});
const outputBase = argument("--output")
  ? resolve(process.cwd(), argument("--output"))
  : resolve(root, `outputs/evals/${datasetId}-${runner}`);
await mkdir(dirname(outputBase), { recursive: true });
await writeFile(`${outputBase}.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(`${outputBase}.md`, profileEvalReportMarkdown(report), "utf8");
console.log(JSON.stringify({
  status: report.passed ? "pass" : "fail",
  dataset: datasetId,
  runner,
  cases: report.caseCount,
  humanVerifiedCases: report.humanVerifiedCaseCount,
  summary: report.summary,
  failureCounts: report.failureCounts,
  reports: [`${outputBase}.json`, `${outputBase}.md`],
}, null, 2));
if (!report.passed && process.argv.includes("--gate")) process.exitCode = 1;
