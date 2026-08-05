import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wrapArtifact } from "../lib/agent-runtime/artifact-envelope.ts";
import { redactTraceValue } from "../lib/agent-runtime/redaction.ts";
import { runPipeline } from "../lib/agents/pipeline.ts";
import { sampleResume } from "../lib/data/sample-resume.ts";

const BASELINE_LABEL = "phase-7-creative-retrieval";
const HISTORICAL_REFERENCE_REVISION = "5c3acfc";
const HISTORICAL_PHASE1_CANDIDATE_REVISION = "f79b9c2";
const EXPECTED_CORE_SHA256 = "75f1b708924563c84615c7ab49f0f0c8bfeefd4b082ea91f0ed37d2fbf43aa1c";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const snapshotPath = resolve(scriptDirectory, "../docs/baselines/agent-pipeline-v1.json");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeDynamicFields(value, key = "") {
  if (Array.isArray(value)) return value.map((entry) => normalizeDynamicFields(entry));
  if (!value || typeof value !== "object") {
    if (["runId", "eventId", "callId"].includes(key)) return `<${key}>`;
    if (["occurredAt", "startedAt", "completedAt"].includes(key)) return "<timestamp>";
    if (key === "latencyMs") return "<latency-ms>";
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([entryKey, entry]) => [
    entryKey,
    normalizeDynamicFields(entry, entryKey),
  ]));
}

function buildSnapshot() {
  const result = runPipeline(sampleResume);
  const core = {
    profile: result.profile,
    brief: result.brief,
    world: result.world,
    report: result.report,
  };
  const coreSha256 = sha256(JSON.stringify(core));
  if (coreSha256 !== EXPECTED_CORE_SHA256) {
    throw new Error(
      `Core Agent artifacts changed: expected ${EXPECTED_CORE_SHA256}, received ${coreSha256}. Review the change before updating the baseline.`,
    );
  }
  return {
    formatVersion: 1,
    source: {
      id: "fictional-sample-resume.v1",
      classification: "public-fictional",
      sha256: sha256(sampleResume),
      text: sampleResume,
    },
    comparison: {
      baselineLabel: BASELINE_LABEL,
      historicalReferenceRevision: HISTORICAL_REFERENCE_REVISION,
      historicalPhase1CandidateRevision: HISTORICAL_PHASE1_CANDIDATE_REVISION,
      coreSha256,
      profileItems: result.profile.items.length,
      rooms: result.world.rooms.length,
      exhibits: result.world.exhibits.length,
      checkScore: result.report.score,
    },
    artifacts: {
      profile: wrapArtifact("profile", result.profile),
      creativeBrief: wrapArtifact("creative-brief", result.brief),
      world: wrapArtifact("world", result.world),
      checkReport: wrapArtifact("check-report", result.report),
    },
    pipeline: {
      trace: normalizeDynamicFields(redactTraceValue(result.trace)),
      run: normalizeDynamicFields(redactTraceValue(result.run)),
    },
  };
}

function serializeSnapshot(snapshot) {
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  const forbidden = [
    /\bBearer\s+[A-Za-z0-9._~+/=-]+/i,
    /\b(?:sk|key)-[A-Za-z0-9_-]{8,}\b/i,
  ];
  if (forbidden.some((pattern) => pattern.test(serialized))) {
    throw new Error("Baseline snapshot contains a credential-like value.");
  }
  return serialized;
}

const expected = serializeSnapshot(buildSnapshot());
if (process.argv.includes("--write")) {
  await mkdir(dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, expected, "utf8");
  console.log(`Wrote ${snapshotPath}`);
} else {
  const actual = await readFile(snapshotPath, "utf8").catch(() => "");
  if (actual !== expected) {
    throw new Error(
      "Agent baseline snapshot is missing or stale. Run `npm run baseline:agent:update` only after reviewing intentional contract changes.",
    );
  }
  const snapshot = JSON.parse(actual);
  console.log(JSON.stringify({
    status: "pass",
    snapshot: snapshotPath,
    baselineLabel: snapshot.comparison.baselineLabel,
    coreSha256: snapshot.comparison.coreSha256,
  }, null, 2));
}
