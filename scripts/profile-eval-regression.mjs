#!/usr/bin/env node
/**
 * Profile Eval 回归门禁。
 *
 * 设计动机：smoke / full 数据集的阈值是 100%，确定性 Parser 存在已知缺陷，
 * 因此两个基线按设计标记为"未通过"，`--gate` 模式永远为红。但迭代仍然需要
 * 一条不能悄悄变差的底线——本脚本把"与基线的相对对比"变成自动门禁：
 *
 * 1. 离线运行确定性 Pipeline（无网络、无模型调用）；
 * 2. 与 `evals/reports/` 中的已审核基线逐项对比；
 * 3. 任何核心指标回退、失败分类计数上升、用例数减少都会失败；
 * 4. `--write` 仅在零回退时把当前结果提升为新基线。
 */
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compareProfileEvalReports } from "../lib/evals/report.ts";

const DATASETS = [
  { id: "smoke", baseline: "evals/reports/smoke-baseline.json", candidate: "outputs/evals/smoke-deterministic-pipeline.json" },
  { id: "full", baseline: "evals/reports/full-baseline.json", candidate: "outputs/evals/full-deterministic-pipeline.json" },
];

const METRIC_LABELS = {
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

const FAILURE_LABELS = {
  identity_mismatch: "身份信息不匹配",
  missed_item: "经历条目漏提",
  unexpected_item: "非预期条目",
  field_mismatch: "字段不匹配",
  missing_evidence: "缺少证据",
  invalid_evidence: "证据无效",
  forbidden_claim: "禁止声明",
  pipeline_failure: "Pipeline 失败",
};

const writeBaselines = process.argv.includes("--write");
const lines = [];
let failed = false;

function percent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

for (const dataset of DATASETS) {
  const run = spawnSync(process.execPath, ["scripts/profile-eval.mjs", "--dataset", dataset.id], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (run.status !== 0) {
    failed = true;
    lines.push(`## 数据集 ${dataset.id}：执行失败`, "", "```", run.stderr.trim() || run.stdout.trim(), "```", "");
    continue;
  }

  const baseline = JSON.parse(await readFile(resolve(process.cwd(), dataset.baseline), "utf8"));
  const candidate = JSON.parse(await readFile(resolve(process.cwd(), dataset.candidate), "utf8"));
  const comparison = compareProfileEvalReports(baseline, candidate);
  const status = comparison.passed ? "通过（无回退）" : "未通过（存在回退）";
  lines.push(`## 数据集 ${dataset.id}：${status}`, "");
  lines.push("| 指标 | 基线 | 当前 | 变化 |", "| --- | ---: | ---: | ---: |");
  for (const [key, label] of Object.entries(METRIC_LABELS)) {
    const delta = comparison.deltas[key];
    lines.push(`| ${label} | ${percent(baseline.summary[key] ?? 0)} | ${percent(candidate.summary[key] ?? 0)} | ${delta > 0 ? "+" : ""}${percent(delta)} |`);
  }
  lines.push("");

  if (!comparison.passed) {
    failed = true;
    lines.push("**回退明细：**");
    for (const regression of comparison.regressions) {
      if (regression.startsWith("failure:")) {
        const category = regression.slice("failure:".length);
        lines.push(`- 失败分类「${FAILURE_LABELS[category] || category}」计数上升`);
      } else if (regression === "caseCount") {
        lines.push(`- 用例数从 ${baseline.caseCount} 减少到 ${candidate.caseCount}`);
      } else {
        lines.push(`- ${METRIC_LABELS[regression] || regression} 回退 ${percent(Math.abs(comparison.deltas[regression] ?? 0))}`);
      }
    }
    lines.push("");
    continue;
  }

  const improvements = Object.entries(comparison.deltas).filter(([key, delta]) => (
    key === "unsupportedClaimRate" ? delta < 0 : delta > 0
  ));
  if (writeBaselines) {
    await writeFile(resolve(process.cwd(), dataset.baseline), `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
    lines.push(`已把当前结果写入新基线：\`${dataset.baseline}\``, "");
  } else if (improvements.length > 0) {
    lines.push(`提示：${improvements.length} 项指标优于基线，可用 \`npm run eval:regression:update\` 审核并更新基线。`, "");
  }
}

lines.push("## 总结", "");
lines.push(failed
  ? "存在指标回退。请检查 Parser、Prompt 或 Provider 变更，确认回退为预期后再考虑更新基线。"
  : "所有数据集相对基线均无回退。该结果说明迭代没有破坏既有行为，不代表模型准确率结论。");

const report = ["# Profile Eval 回归报告", "", `_生成时间：${new Date().toISOString()}_`, "", ...lines, ""].join("\n");
await writeFile(resolve(process.cwd(), "outputs/evals/regression-report.md"), report, "utf8");
console.log(report);
if (failed) process.exitCode = 1;
