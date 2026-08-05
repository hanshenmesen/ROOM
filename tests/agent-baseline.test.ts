import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);
const snapshotUrl = new URL("../docs/baselines/agent-pipeline-v1.json", import.meta.url);

test("the offline Agent baseline is current, deterministic, and credential-free", () => {
  const output = execFileSync(process.execPath, ["scripts/agent-baseline.mjs"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  const result = JSON.parse(output) as { status: string; coreSha256: string };
  assert.equal(result.status, "pass");
  assert.equal(result.coreSha256, "71873d47cd8b9c74ad1c7329025968d5692f67d2b9215437f8a9362a926d1d24");

  const snapshot = readFileSync(snapshotUrl, "utf8");
  assert.doesNotMatch(snapshot, /\bBearer\s+[A-Za-z0-9._~+/=-]+/i);
  assert.doesNotMatch(snapshot, /\b(?:sk|key)-[A-Za-z0-9_-]{8,}\b/i);
  assert.match(snapshot, /"classification": "public-fictional"/);
  assert.match(snapshot, /"schemaVersion": "profile\.v1"/);
});
