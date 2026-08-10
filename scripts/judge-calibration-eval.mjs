#!/usr/bin/env node
/**
 * LLM Judge 校准评测（零模型调用）。
 *
 * 读取人工评分与 Judge 评分的配对数据集，计算每个评分维度的一致性指标
 * （exact / within-one agreement、MAE、二次加权 Cohen's Kappa），并输出
 * 校准报告。只有全部维度通过门槛，才允许把 Judge 分数作为质量证据；
 * 当前数据集为合成演示数据，结论不能外推为"Judge 已校准"。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { calibrateJudge } from "../lib/evals/judge-calibration.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const datasetPath = argument("--dataset") || "evals/judge-calibration-cases.json";
const dataset = JSON.parse(await readFile(resolve(root, datasetPath), "utf8"));
if (dataset.schemaVersion !== "judge-calibration-dataset.v1") {
  throw new Error(`Unsupported judge calibration dataset schema: ${dataset.schemaVersion}.`);
}

const report = calibrateJudge({
  dimensions: dataset.dimensions,
  samples: dataset.samples,
  thresholds: dataset.thresholds,
});

const lines = [
  `# LLM Judge 校准报告`,
  "",
  `- 数据集：\`${datasetPath}\`（${dataset.reviewStatus}）`,
  `- 校准结果：**${report.overall.passed ? "通过" : "未通过"}**`,
  `- 样本数：${report.sampleCount}`,
  `- 平均加权 Kappa：${report.overall.meanWeightedKappa ?? "N/A"}`,
  "",
  "| 维度 | 样本 | Exact | Within-1 | MAE | 加权 Kappa | 结果 |",
  "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
  ...report.dimensions.map((dimension) => (
    `| ${dimension.label}（\`${dimension.dimensionId}\`） | ${dimension.sampleCount} | ${(dimension.exactAgreement * 100).toFixed(1)}% | ${(dimension.withinOneAgreement * 100).toFixed(1)}% | ${dimension.meanAbsoluteError} | ${dimension.weightedKappa ?? "N/A"} | ${dimension.passed ? "通过" : "未通过"} |`
  )),
  "",
  `> ${dataset.notes}`,
  "",
];
const markdown = lines.join("\n");

const outputBase = argument("--output")
  ? resolve(process.cwd(), argument("--output"))
  : resolve(root, "outputs/evals/judge-calibration");
await mkdir(dirname(outputBase), { recursive: true });
await writeFile(`${outputBase}.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(`${outputBase}.md`, markdown, "utf8");
console.log(markdown);
if (!report.overall.passed && process.argv.includes("--gate")) process.exitCode = 1;
