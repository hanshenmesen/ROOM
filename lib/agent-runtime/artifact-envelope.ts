import type { CheckReport, CreativeBrief, ParsedProfile, WorldPlan } from "../types.ts";

export const ARTIFACT_SCHEMA_VERSIONS = {
  profile: "profile.v1",
  "creative-brief": "creative-brief.v1",
  world: "world.v1",
  "check-report": "check-report.v1",
} as const;

export type ArtifactKind = keyof typeof ARTIFACT_SCHEMA_VERSIONS;

export type ArtifactDataByKind = {
  profile: ParsedProfile;
  "creative-brief": CreativeBrief;
  world: WorldPlan;
  "check-report": CheckReport;
};

export type ArtifactSchemaVersion<K extends ArtifactKind = ArtifactKind> =
  (typeof ARTIFACT_SCHEMA_VERSIONS)[K];

export type VersionedArtifactEnvelope<
  T,
  K extends ArtifactKind = ArtifactKind,
> = {
  artifactType: K;
  schemaVersion: ArtifactSchemaVersion<K>;
  data: T;
};

export type KnownArtifactEnvelope<K extends ArtifactKind> = VersionedArtifactEnvelope<
  ArtifactDataByKind[K],
  K
>;

export class InvalidArtifactEnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidArtifactEnvelopeError";
  }
}

export class UnsupportedArtifactVersionError extends Error {
  readonly artifactType: ArtifactKind;
  readonly receivedVersion: string;
  readonly expectedVersion: ArtifactSchemaVersion;

  constructor(
    artifactType: ArtifactKind,
    receivedVersion: string,
    expectedVersion: ArtifactSchemaVersion,
  ) {
    super(`Unsupported ${artifactType} artifact version: ${receivedVersion}; expected ${expectedVersion}.`);
    this.name = "UnsupportedArtifactVersionError";
    this.artifactType = artifactType;
    this.receivedVersion = receivedVersion;
    this.expectedVersion = expectedVersion;
  }
}

export function wrapArtifact<K extends ArtifactKind>(
  artifactType: K,
  data: ArtifactDataByKind[K],
): KnownArtifactEnvelope<K> {
  return {
    artifactType,
    schemaVersion: ARTIFACT_SCHEMA_VERSIONS[artifactType],
    data,
  };
}

export function migrateArtifact<K extends ArtifactKind>(
  artifactType: K,
  input: unknown,
): KnownArtifactEnvelope<K> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new InvalidArtifactEnvelopeError(`${artifactType} artifact must be an object envelope.`);
  }
  const envelope = input as Record<string, unknown>;
  if (envelope.artifactType !== artifactType) {
    throw new InvalidArtifactEnvelopeError(
      `Artifact type mismatch: expected ${artifactType}, received ${String(envelope.artifactType || "missing")}.`,
    );
  }
  if (typeof envelope.schemaVersion !== "string") {
    throw new InvalidArtifactEnvelopeError(`${artifactType} artifact is missing schemaVersion.`);
  }
  const expectedVersion = ARTIFACT_SCHEMA_VERSIONS[artifactType];
  if (envelope.schemaVersion !== expectedVersion) {
    throw new UnsupportedArtifactVersionError(artifactType, envelope.schemaVersion, expectedVersion);
  }
  if (!("data" in envelope)) {
    throw new InvalidArtifactEnvelopeError(`${artifactType} artifact is missing data.`);
  }
  return {
    artifactType,
    schemaVersion: expectedVersion,
    data: envelope.data as ArtifactDataByKind[K],
  };
}
