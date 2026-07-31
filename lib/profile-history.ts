import type { ParsedProfile } from "./types";

export const PROFILE_HISTORY_STORAGE_KEY = "room:generated-profiles:v1";
export const MAX_SAVED_PROFILES = 6;

export type SavedProfileRecord = {
  profile: ParsedProfile;
  savedAt: string;
};

export function isSavedProfileRecord(value: unknown): value is SavedProfileRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<SavedProfileRecord>;
  const profile = record.profile as Partial<ParsedProfile> | undefined;
  return typeof record.savedAt === "string"
    && typeof profile?.id === "string"
    && typeof profile.name === "string"
    && typeof profile.headline === "string"
    && typeof profile.summary === "string"
    && Array.isArray(profile.contacts)
    && Array.isArray(profile.media)
    && Array.isArray(profile.skills)
    && Array.isArray(profile.items)
    && Boolean(profile.source && typeof profile.source === "object");
}

export function upsertSavedProfile(
  records: SavedProfileRecord[],
  profile: ParsedProfile,
  savedAt: string,
): SavedProfileRecord[] {
  const withoutExisting = records.filter((record) => record.profile.id !== profile.id);
  return [{ profile, savedAt }, ...withoutExisting].slice(0, MAX_SAVED_PROFILES);
}
