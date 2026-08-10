import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MAX_DIARY_ENTRIES,
  MAX_DIARY_TEXT_LENGTH,
  appendDiaryEntry,
  diaryEntryFromDraft,
} from "../lib/diary.ts";

test("an in-world diary entry accepts text, image, or both", () => {
  assert.equal(diaryEntryFromDraft({ id: "empty", text: "  ", createdAt: "now" }), null);
  assert.deepEqual(
    diaryEntryFromDraft({ id: "image", text: "", imageDataUrl: "data:image/png;base64,x", createdAt: "now" }),
    { id: "image", text: "", imageDataUrl: "data:image/png;base64,x", createdAt: "now" },
  );
  assert.equal(
    diaryEntryFromDraft({ id: "text", text: "x".repeat(MAX_DIARY_TEXT_LENGTH + 10), createdAt: "now" })?.text.length,
    MAX_DIARY_TEXT_LENGTH,
  );
});

test("the local diary keeps only the latest bounded entries", () => {
  const entries = Array.from({ length: MAX_DIARY_ENTRIES }, (_, index) => ({
    id: String(index), text: String(index), createdAt: "now",
  }));
  const next = appendDiaryEntry(entries, { id: "latest", text: "latest", createdAt: "now" });
  assert.equal(next.length, MAX_DIARY_ENTRIES);
  assert.equal(next.at(-1)?.id, "latest");
  assert.equal(next[0]?.id, "1");
});

test("the parsing wait screen customizes Xiaobai and frame photos without writing the diary", () => {
  const studioSource = readFileSync(new URL("../components/RoomStudio.tsx", import.meta.url), "utf8");
  const moveInSource = readFileSync(new URL("../components/MoveInStudio.tsx", import.meta.url), "utf8");
  assert.match(studioSource, /!result && \(loading \|\| pendingProfile\)/);
  assert.match(studioSource, /<MoveInStudio/);
  assert.match(studioSource, /writeStoredProfileSpace\(profileSpace\)/);
  assert.match(moveInSource, /先捏一个属于你的/);
  assert.match(moveInSource, /选择性格/);
  assert.match(moveInSource, /multiple onChange=\{onPhotosChange\}/);
  assert.match(moveInSource, /日记进入世界后再写/);
  assert.doesNotMatch(moveInSource, /DiaryComposer|diaryText|diaryImage/);
});
