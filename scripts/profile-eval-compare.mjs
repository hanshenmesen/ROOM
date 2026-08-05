import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compareProfileEvalReports } from "../lib/evals/report.ts";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const baselinePath = argument("--baseline");
const candidatePath = argument("--candidate");
if (!baselinePath || !candidatePath) {
  throw new Error("Usage: npm run eval:compare -- --baseline baseline.json --candidate candidate.json [--output comparison.json]");
}
const baseline = JSON.parse(await readFile(resolve(process.cwd(), baselinePath), "utf8"));
const candidate = JSON.parse(await readFile(resolve(process.cwd(), candidatePath), "utf8"));
if (baseline.schemaVersion !== "profile-eval-report.v1" || candidate.schemaVersion !== "profile-eval-report.v1") {
  throw new Error("Both inputs must be profile-eval-report.v1 reports.");
}
const comparison = compareProfileEvalReports(baseline, candidate);
const serialized = `${JSON.stringify(comparison, null, 2)}\n`;
const outputPath = argument("--output");
if (outputPath) await writeFile(resolve(process.cwd(), outputPath), serialized, "utf8");
console.log(serialized.trimEnd());
if (!comparison.passed) process.exitCode = 1;
