import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  creativeRetrievalReportMarkdown,
  evaluateCreativeRetrieval,
} from "../lib/evals/creative-retrieval.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const datasetPath = resolve(root, "evals/creative-retrieval-cases.json");
const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
const report = evaluateCreativeRetrieval(dataset);
const outputIndex = process.argv.indexOf("--output");
const outputBase = outputIndex >= 0 && process.argv[outputIndex + 1]
  ? resolve(process.cwd(), process.argv[outputIndex + 1])
  : resolve(root, "evals/reports/creative-retrieval-v1");
await mkdir(dirname(outputBase), { recursive: true });
await writeFile(`${outputBase}.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(`${outputBase}.md`, creativeRetrievalReportMarkdown(report), "utf8");
console.log(JSON.stringify({
  status: report.passed ? "pass" : "fail",
  dataset: report.dataset,
  catalogSize: report.catalogSize,
  cases: report.caseCount,
  summary: report.summary,
  vectorRetrievalRecommended: report.vectorRetrievalRecommended,
  reports: [`${outputBase}.json`, `${outputBase}.md`],
}, null, 2));
if (!report.passed && process.argv.includes("--gate")) process.exitCode = 1;
