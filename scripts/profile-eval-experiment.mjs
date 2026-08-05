import { execFileSync } from "node:child_process";
import process from "node:process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareProfileEvalReports } from "../lib/evals/report.ts";
import { getAgentProviderConfig } from "../lib/agents/provider-config.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (!process.argv.includes("--ignore-local-env")) {
  try {
    process.loadEnvFile(resolve(root, ".env.local"));
  } catch (error) {
    if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error;
  }
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function providerReadiness() {
  const config = getAgentProviderConfig();
  const maas = config.maas.apiKeys.length > 0;
  const website = config.website.apiKeys.length > 0;
  const selected = maas ? config.maas : config.website;
  return {
    ready: maas || website,
    resumeProvider: maas ? "MAAS" : website ? "Website fallback" : "not-configured",
    baseUrl: selected.baseUrl,
    model: selected.model,
    mode: selected.mode,
    secretsExposed: false,
  };
}

function comparisonMarkdown(comparison, baseline, candidate) {
  const labels = {
    identityAccuracy: "身份信息准确率",
    itemPrecision: "条目精确率",
    itemRecall: "条目召回率",
    itemF1: "条目 F1",
    fieldAccuracy: "结构化字段准确率",
    evidenceCoverage: "证据覆盖率",
    evidenceAccuracy: "证据准确率",
    unsupportedClaimRate: "无证据声明率",
    endToEndSuccess: "端到端成功率",
  };
  const value = (number) => typeof number === "number" ? number : "N/A";
  return [
    "# Profile Agent 真实 Provider 对比评测：" + baseline.dataset,
    "",
    "- 评测结果：**" + (comparison.passed ? "通过" : "存在回归") + "**",
    "- 基线执行器：`" + baseline.runner + "`",
    "- 候选执行器：`" + candidate.runner + "`",
    "- 用例数：" + candidate.caseCount,
    "",
    "## 指标对比",
    "",
    "| 指标 | 确定性基线 | Profile Agent | 差值 |",
    "| --- | ---: | ---: | ---: |",
    ...Object.entries(comparison.deltas).map(([key, delta]) => (
      "| " + labels[key] + " | " + baseline.summary[key] + " | " + candidate.summary[key] + " | " + (delta > 0 ? "+" : "") + delta + " |"
    )),
    "",
    "## 真实模型运行成本",
    "",
    "| 模型调用 | Input Token | Output Token | 模型延迟 | 预估成本 |",
    "| ---: | ---: | ---: | ---: | ---: |",
    "| " + candidate.summary.modelCalls + " | " + value(candidate.summary.inputTokens) + " | " + value(candidate.summary.outputTokens) + " | " + candidate.summary.latencyMs + " ms | " + (candidate.summary.estimatedCost === null ? "N/A" : "$" + candidate.summary.estimatedCost.toFixed(6)) + " |",
    "",
    "## 回归项",
    "",
    ...(comparison.regressions.length ? comparison.regressions.map((value) => "- `" + value + "`") : ["未发现回归。"]),
    "",
  ].join("\n");
}

function preflightMarkdown(preflight) {
  return [
    "# Profile Agent 真实 Provider 评测预检",
    "",
    `- 状态：**${preflight.status === "ready" ? "可运行" : "已阻塞"}**`,
    `- 数据集：\`${preflight.dataset}\``,
    `- Provider：${preflight.provider}`,
    `- 模型：\`${preflight.model}\``,
    `- 调用模式：\`${preflight.mode}\``,
    `- 凭据状态：${preflight.status === "ready" ? "已配置（未写入报告）" : "未配置"}`,
    "",
    preflight.status === "ready"
      ? "运行 `npm run eval:experiment -- --dataset " + preflight.dataset + " --allow-model-calls` 产出真实模型报告。"
      : "未执行任何模型调用。配置 Provider API Key 后重新运行预检。",
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
  schemaVersion: "profile-provider-eval-preflight.v1",
  status: readiness.ready ? "ready" : "blocked",
  dataset,
  provider: readiness.resumeProvider,
  baseUrl: readiness.baseUrl,
  model: readiness.model,
  mode: readiness.mode,
  secretsExposed: false,
  requiresAllowModelCalls: true,
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  },
  expectedOutputs: [
    outputBase + "-deterministic.json",
    outputBase + "-deterministic.md",
    outputBase + "-profile-agent.json",
    outputBase + "-profile-agent.md",
    outputBase + "-comparison.json",
    outputBase + "-comparison.md",
    outputBase + "-manifest.json",
  ],
};

if (process.argv.includes("--preflight")) {
  if (process.argv.includes("--write")) {
    await mkdir(dirname(outputBase), { recursive: true });
    await writeFile(outputBase + "-preflight.json", JSON.stringify(preflight, null, 2) + "\n", "utf8");
    await writeFile(outputBase + "-preflight.md", preflightMarkdown(preflight), "utf8");
  }
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
await writeFile(outputBase + "-manifest.json", JSON.stringify({
  schemaVersion: "profile-provider-eval-manifest.v1",
  dataset,
  provider: {
    name: readiness.resumeProvider,
    baseUrl: readiness.baseUrl,
    model: readiness.model,
    mode: readiness.mode,
    secretsExposed: false,
  },
  environment: preflight.environment,
  outputs: preflight.expectedOutputs,
  metrics: candidate.summary,
}, null, 2) + "\n", "utf8");
console.log(JSON.stringify({
  status: comparison.passed ? "pass" : "regression",
  dataset,
  comparison: outputBase + "-comparison.json",
  report: outputBase + "-comparison.md",
}, null, 2));
if (!comparison.passed) process.exitCode = 1;
