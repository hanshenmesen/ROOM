import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hanchenDemoProfile } from "../lib/data/hanchen-demo-profile.ts";
import {
  MAX_SAVED_PROFILES,
  isSavedProfileRecord,
  upsertSavedProfile,
} from "../lib/profile-history.ts";

test("generated profiles are deduplicated, newest-first, and bounded", () => {
  const records = Array.from({ length: MAX_SAVED_PROFILES }, (_, index) => ({
    profile: { ...hanchenDemoProfile, id: `profile-${index}`, name: `Person ${index}` },
    savedAt: `2026-07-${String(index + 1).padStart(2, "0")}`,
  }));
  const updated = upsertSavedProfile(records, records[2]!.profile, "latest");
  assert.equal(updated.length, MAX_SAVED_PROFILES);
  assert.equal(updated[0]?.profile.id, "profile-2");
  assert.equal(updated[0]?.savedAt, "latest");
  assert.equal(updated.filter((record) => record.profile.id === "profile-2").length, 1);
});

test("saved profile records reject malformed local data", () => {
  assert.equal(isSavedProfileRecord(null), false);
  assert.equal(isSavedProfileRecord({ profile: hanchenDemoProfile, savedAt: "now" }), true);
  assert.equal(isSavedProfileRecord({ profile: { id: "x", name: "X", items: [] }, savedAt: "now" }), false);
});

test("successful parsing persists a reloadable recent demo", () => {
  const source = readFileSync(new URL("../components/RoomStudio.tsx", import.meta.url), "utf8");
  assert.match(source, /function rememberGeneratedProfile\(profile: ParsedProfile\)/);
  assert.match(source, /writeStoredEntries\(PROFILE_HISTORY_STORAGE_KEY, nextProfiles\)/);
  assert.match(source, /savedProfiles\.map\(\(record\)/);
  assert.match(source, /onClick=\{\(\) => openWorld\(record\.profile\)\}/);
});
