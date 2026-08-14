import assert from "node:assert/strict";
import test from "node:test";
import {
  ARTIFACT_SCHEMA_VERSIONS,
  InvalidArtifactEnvelopeError,
  UnsupportedArtifactVersionError,
  migrateArtifact,
  registerArtifactCodec,
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

test("registerArtifactCodec dispatches a registered migrator for an old version", () => {
  const dispose = registerArtifactCodec({
    artifactType: "check-report",
    migrate: (data, fromVersion) => {
      assert.equal(fromVersion, "check-report.v0");
      const legacy = data as { passed: boolean; score: number; summary: string; checks: { name: string; passed: boolean; detail: string }[] };
      return { ...legacy, issues: [] };
    },
  });
  try {
    const migrated = migrateArtifact("check-report", {
      artifactType: "check-report",
      schemaVersion: "check-report.v0",
      data: { passed: true, score: 100, summary: "legacy", checks: [] },
    });
    assert.equal(migrated.schemaVersion, ARTIFACT_SCHEMA_VERSIONS["check-report"]);
    assert.deepEqual(migrated.data.issues, []);
  } finally {
    dispose();
  }
  // Once disposed, the same legacy version fails loud again instead of
  // silently reusing the unregistered codec.
  assert.throws(() => migrateArtifact("check-report", {
    artifactType: "check-report",
    schemaVersion: "check-report.v0",
    data: { passed: true, score: 100, summary: "legacy", checks: [] },
  }), UnsupportedArtifactVersionError);
});
