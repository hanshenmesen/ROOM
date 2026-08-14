import type { CheckReport, CreativeBrief, ParsedProfile, WorldPlan } from "../types.ts";
import type { ProfileMergeReport } from "../profile-merge.ts";
import type { ProfileIdentityCheckpoint, ProfileInventoryCheckpoint } from "../agents/profile/workflow-shards.ts";
import type { PreparedSourceCheckpoint, WebsiteResearchCheckpoint } from "../workflow/types.ts";

export const ARTIFACT_SCHEMA_VERSIONS = {
  "prepared-source": "prepared-source.v1",
  profile: "profile.v1",
  "profile-identity": "profile-identity.v1",
  "profile-inventory": "profile-inventory.v1",
  "resume-profile": "profile.v1",
  "website-research": "website-research.v1",
  "profile-merge-report": "profile-merge-report.v1",
  "creative-brief": "creative-brief.v1",
  world: "world.v1",
  "check-report": "check-report.v1",
} as const;

export type ArtifactKind = keyof typeof ARTIFACT_SCHEMA_VERSIONS;

export type ArtifactDataByKind = {
  "prepared-source": PreparedSourceCheckpoint;
  profile: ParsedProfile;
  "profile-identity": ProfileIdentityCheckpoint;
  "profile-inventory": ProfileInventoryCheckpoint;
  "resume-profile": ParsedProfile;
  "website-research": WebsiteResearchCheckpoint;
  "profile-merge-report": ProfileMergeReport;
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

/**
 * Migrates one Artifact kind's data from an older schema version to the
 * current one. Registered per Artifact kind (see `registerArtifactCodec`)
 * so adding a new version only means touching that Artifact's own module
 * -- never this central file, and never any other Artifact's codec.
 */
export type ArtifactCodec<K extends ArtifactKind = ArtifactKind> = {
  artifactType: K;
  /** Migrates `data` from `fromVersion` to the current `ARTIFACT_SCHEMA_VERSIONS[artifactType]`. Should throw (never silently pass through) for a version it does not recognize. */
  migrate(data: unknown, fromVersion: string): ArtifactDataByKind[K];
};

const artifactCodecs = new Map<ArtifactKind, ArtifactCodec>();

/**
 * Registers a migrator for one Artifact kind. Returns a disposer that
 * unregisters it (a no-op if it was already replaced/removed) -- mirrors
 * `ToolPipeline.register()`'s "add a capability, get back an undo" shape.
 */
export function registerArtifactCodec<K extends ArtifactKind>(codec: ArtifactCodec<K>): () => void {
  artifactCodecs.set(codec.artifactType, codec as ArtifactCodec);
  return () => {
    if (artifactCodecs.get(codec.artifactType) === (codec as ArtifactCodec)) artifactCodecs.delete(codec.artifactType);
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
    // No artifact currently ships more than one schema version, so this
    // registry has no entries yet -- every mismatch still fails loud below,
    // exactly as before. The dispatch exists so the *first* Artifact that
    // needs a real migration can register one in its own module instead of
    // this file growing a per-artifact `if` chain.
    const codec = artifactCodecs.get(artifactType);
    if (codec) {
      return {
        artifactType,
        schemaVersion: expectedVersion,
        data: codec.migrate(envelope.data, envelope.schemaVersion) as ArtifactDataByKind[K],
      };
    }
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
