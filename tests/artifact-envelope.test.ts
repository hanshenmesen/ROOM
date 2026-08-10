import assert from "node:assert/strict";
import test from "node:test";
import {
  ARTIFACT_SCHEMA_VERSIONS,
  InvalidArtifactEnvelopeError,
  UnsupportedArtifactVersionError,
  migrateArtifact,
  wrapArtifact,
} from "../lib/agent-runtime/artifact-envelope.ts";
import { runPipeline } from "../lib/agents/pipeline.ts";
import { sampleResume } from "../lib/data/sample-resume.ts";
import { mergeProfilesWithReport } from "../lib/profile-merge.ts";

test("wrapArtifact assigns the current schema version without changing artifact data", () => {
  const profile = runPipeline(sampleResume).profile;
  const envelope = wrapArtifact("profile", profile);
  assert.equal(envelope.schemaVersion, ARTIFACT_SCHEMA_VERSIONS.profile);
  assert.equal(envelope.data, profile);
});

test("migrateArtifact accepts a current v1 envelope", () => {
  const world = runPipeline(sampleResume).world;
  const envelope = wrapArtifact("world", world);
  assert.deepEqual(migrateArtifact("world", structuredClone(envelope)), envelope);
});

test("Profile Merge Reports use an explicit artifact envelope version", () => {
  const primary = runPipeline(sampleResume).profile;
  const supplement = structuredClone(primary);
  const report = mergeProfilesWithReport(primary, supplement, "two public sources");
  const envelope = wrapArtifact("profile-merge-report", report);
  assert.equal(envelope.schemaVersion, "profile-merge-report.v1");
  assert.equal(migrateArtifact("profile-merge-report", envelope).data.reviewRequired, false);
});

test("migrateArtifact rejects unknown versions explicitly", () => {
  assert.throws(
    () => migrateArtifact("profile", {
      artifactType: "profile",
      schemaVersion: "profile.v99",
      data: {},
    }),
    UnsupportedArtifactVersionError,
  );
});

test("migrateArtifact rejects malformed or mismatched envelopes", () => {
  assert.throws(() => migrateArtifact("profile", null), InvalidArtifactEnvelopeError);
  assert.throws(() => migrateArtifact("profile", {
    artifactType: "world",
    schemaVersion: "world.v1",
    data: {},
  }), InvalidArtifactEnvelopeError);
  assert.throws(() => migrateArtifact("profile", {
    artifactType: "profile",
    schemaVersion: "profile.v1",
  }), InvalidArtifactEnvelopeError);
});
